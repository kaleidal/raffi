package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path"
	"path/filepath"
	"raffi-server/src/session"
	"raffi-server/src/stream"
	"raffi-server/src/stream/hls"
	"runtime"
	"runtime/debug"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

type Server struct {
	sessions        session.Store
	torrentStreamer *stream.TorrentStreamer
	hlsController   *hls.Controller
	ffmpegPath      string
	ffprobePath     string
	probeMu         sync.Mutex
	probeCooldown   map[string]time.Time
	bridge          *BridgeService
}

func main() {
	debug.SetTraceback("single")
	preferGoDNSResolver()

	ffmpegPath, ffprobePath, err := resolveMediaToolPaths()
	if err != nil {
		log.Fatalf("failed to resolve media tools: %v", err)
	}

	srv := &Server{
		sessions:        session.NewMemoryStore(),
		torrentStreamer: stream.NewTorrentStreamer(filepath.Join(os.TempDir(), "raffi-torrents")),
		hlsController:   hls.NewController(ffmpegPath, ffprobePath),
		ffmpegPath:      ffmpegPath,
		ffprobePath:     ffprobePath,
		probeCooldown:   make(map[string]time.Time),
	}
	srv.bridge = NewBridgeService(srv)

	log.Printf("Using ffmpeg: %s", ffmpegPath)
	log.Printf("Using ffprobe: %s", ffprobePath)

	// Set up cleanup on exit
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	go func() {
		<-sigChan
		log.Println("\nReceived shutdown signal, cleaning up...")

		// Close torrent client
		if srv.torrentStreamer != nil {
			srv.torrentStreamer.Close()
		}

		// Remove all torrent files
		torrentDir := filepath.Join(os.TempDir(), "raffi-torrents")
		if err := os.RemoveAll(torrentDir); err != nil {
			log.Printf("Warning: failed to remove torrent directory: %v", err)
		} else {
			log.Printf("Removed torrent directory: %s", torrentDir)
		}

		// Remove raffi temp directory
		raffiDir := filepath.Join(os.TempDir(), "raffi")
		if err := os.RemoveAll(raffiDir); err != nil {
			log.Printf("Warning: failed to remove raffi directory: %v", err)
		} else {
			log.Printf("Removed raffi directory: %s", raffiDir)
		}

		log.Println("Cleanup complete, exiting")
		os.Exit(0)
	}()

	// Start background cleanup goroutine
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			srv.hlsController.CleanupOrphanedSessions()
		}
	}()

	mux := http.NewServeMux()
	mux.HandleFunc("/sessions", srv.handleSessions)
	mux.HandleFunc("/sessions/", srv.handleSessionByID)
	mux.HandleFunc("/cleanup", srv.handleCleanup)
	mux.HandleFunc("/torrents/", srv.torrentStreamer.ServeHTTP)
	mux.HandleFunc("/settings/torrenting", srv.handleTorrentingSetting)
	mux.HandleFunc("/community-addons", srv.handleCommunityAddons)
	srv.bridge.RegisterLocalAdmin(mux)

	addr := strings.TrimSpace(os.Getenv("RAFFI_SERVER_ADDR"))
	if addr == "" {
		addr = "127.0.0.1:6969"
	}
	listener, err := net.Listen("tcp4", addr)
	if err != nil {
		log.Fatalf("failed to bind to %s: %v", addr, err)
	}
	log.Printf("Server listening on http://%s\n", listener.Addr().String())
	if err := srv.bridge.Restore(); err != nil {
		log.Printf("Nearby-device bridge could not be restored: %v", err)
	}
	if err := http.Serve(listener, withCORS(mux)); err != nil {
		log.Fatal(err)
	}
}

func resolveMediaToolPaths() (string, string, error) {
	ffmpegPath := resolveMediaToolPathSmart("RAFFI_FFMPEG_BIN", "ffmpeg")
	ffprobePath := resolveMediaToolPathSmart("RAFFI_FFPROBE_BIN", "ffprobe")

	log.Printf("Resolved ffmpeg: %s", ffmpegPath)
	log.Printf("Resolved ffprobe: %s", ffprobePath)

	return ffmpegPath, ffprobePath, nil
}

// resolveMediaToolPathSmart implements a robust priority order:
// 1. Explicit env var (highest priority, for power users / testing)
// 2. System binary found on PATH (most reliable on Linux, common via brew on macOS)
// 3. Sibling binary next to the current executable (what we bundle)
// 4. Plain command name (final fallback to whatever is in PATH)
func resolveMediaToolPathSmart(envKey, baseName string) string {
	toolName := executableToolName(baseName)

	// 1. Explicit override
	if configured := strings.TrimSpace(os.Getenv(envKey)); configured != "" {
		if _, err := os.Stat(configured); err == nil {
			return configured
		}
		log.Printf("%s=%s is set but the file does not exist, ignoring", envKey, configured)
	}

	// 2. Try to find a good system binary first (best on Linux)
	if systemPath, err := exec.LookPath(toolName); err == nil {
		return systemPath
	}

	// 3. Sibling next to our own binary (the bundled one we ship)
	if exePath, err := os.Executable(); err == nil {
		candidate := filepath.Join(filepath.Dir(exePath), toolName)
		if _, statErr := os.Stat(candidate); statErr == nil {
			return candidate
		}
	}

	// 4. Last resort — just use the name and let the system resolve it
	return toolName
}

func executableToolName(base string) string {
	if runtime.GOOS == "windows" {
		return base + ".exe"
	}
	return base
}

func preferGoDNSResolver() {
	net.DefaultResolver = &net.Resolver{PreferGo: true}
	if existing := strings.TrimSpace(os.Getenv("GODEBUG")); existing == "" {
		_ = os.Setenv("GODEBUG", "netdns=go")
	} else if !strings.Contains(existing, "netdns=") {
		_ = os.Setenv("GODEBUG", existing+",netdns=go")
	}
}

func (s *Server) handleAudioTrack(w http.ResponseWriter, r *http.Request, id string) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Index int `json:"index"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}

	if s.hlsController != nil {
		if err := s.hlsController.SetAudioTrack(id, req.Index); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}

	if sess, err := s.sessions.Get(id); err == nil {
		sess.AudioIndex = req.Index
	}
	w.WriteHeader(http.StatusOK)
}

func (s *Server) handleSubtitleTrack(w http.ResponseWriter, r *http.Request, id, indexStr string) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	subtitleIndex, err := strconv.Atoi(indexStr)
	if err != nil || subtitleIndex < 0 {
		http.Error(w, "invalid subtitle index", http.StatusBadRequest)
		return
	}

	sess, err := s.sessions.Get(id)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	if sess.Kind != session.SessionKindHTTP {
		http.Error(w, "unsupported session type", http.StatusBadRequest)
		return
	}

	found := false
	for _, stream := range sess.AvailableStreams {
		if stream.Type == "subtitle" && stream.Index == subtitleIndex {
			found = true
			break
		}
	}
	if !found && s.hlsController != nil {
		meta, probeErr := s.hlsController.ProbeMetadata(r.Context(), sess.ID, sess.Source)
		if probeErr == nil && meta != nil {
			streams, _ := hls.StreamsFromMetadata(meta)
			for _, stream := range streams {
				if stream.Type == "subtitle" && stream.Index == subtitleIndex {
					found = true
					break
				}
			}
			if len(streams) > 0 {
				sess.AvailableStreams = streams
			}
		}
	}
	if !found {
		http.Error(w, "subtitle track not found", http.StatusNotFound)
		return
	}

	startTime := 0.0
	if raw := r.URL.Query().Get("startTime"); raw != "" {
		if val, parseErr := strconv.ParseFloat(raw, 64); parseErr == nil && val >= 0 {
			startTime = val
		}
	}

	w.Header().Set("Content-Type", "text/vtt; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
	w.WriteHeader(http.StatusOK)

	if err := hls.StreamSubtitle(r.Context(), s.ffmpegPath, sess.Source, subtitleIndex, startTime, w); err != nil {
		log.Printf("subtitle stream failed for session %s track %d: %v", id, subtitleIndex, err)
	}
}

// POST /sessions  -> create session
// OPTIONS /sessions -> preflight
// Anything else -> 405
func (s *Server) handleSessions(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Source    string              `json:"source"`
		Kind      session.SessionKind `json:"kind"`
		StartTime float64             `json:"startTime"`
		FileIdx   *int                `json:"fileIdx,omitempty"`
		Prefetch  bool                `json:"prefetch,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}

	var sess *session.Session
	var err error

	if req.Kind == session.SessionKindTorrent {
		streamURL, infoHash, err := s.torrentStreamer.AddTorrent(req.Source, req.FileIdx)
		if err != nil {
			if errors.Is(err, stream.ErrTorrentingDisabled) {
				http.Error(w, err.Error(), http.StatusForbidden)
				return
			}
			http.Error(w, fmt.Sprintf("failed to start torrent: %v", err), http.StatusInternalServerError)
			return
		}

		sess, err = s.sessions.Create(streamURL, session.SessionKindHTTP, req.StartTime)
		if err == nil {
			sess.IsTorrent = true
			sess.TorrentInfoHash = infoHash
		}
	} else {
		sess, err = s.sessions.Create(req.Source, req.Kind, req.StartTime)
	}

	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.Prefetch && s.hlsController != nil {
		s.hlsController.SetBufferAheadLimit(sess.ID, hls.PrefetchBufferAhead)
	}

	writeJSON(w, struct {
		ID string `json:"id"`
	}{ID: sess.ID})
}

func (s *Server) handleTorrentingSetting(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method == http.MethodGet {
		writeJSON(w, struct {
			Enabled bool `json:"enabled"`
		}{Enabled: s.torrentStreamer.IsEnabled()})
		return
	}
	if r.Method != http.MethodPut {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}
	if req.Enabled {
		if err := s.torrentStreamer.Enable(); err != nil {
			http.Error(w, fmt.Sprintf("failed to enable torrenting: %v", err), http.StatusInternalServerError)
			return
		}
	} else {
		s.torrentStreamer.Disable()
		for _, sess := range s.sessions.List() {
			if sess == nil || !sess.IsTorrent {
				continue
			}
			if s.hlsController != nil {
				_ = s.hlsController.StopSession(sess.ID)
			}
			s.probeMu.Lock()
			delete(s.probeCooldown, sess.ID)
			s.probeMu.Unlock()
			_ = s.sessions.Delete(sess.ID)
		}
	}
	writeJSON(w, struct {
		Enabled bool `json:"enabled"`
	}{Enabled: s.torrentStreamer.IsEnabled()})
}

// /sessions/{id}         GET -> info
// /sessions/{id}/stream  GET -> stream
func (s *Server) handleSessionByID(w http.ResponseWriter, r *http.Request) {
	// path: /sessions/{id} or /sessions/{id}/stream
	path := strings.TrimPrefix(r.URL.Path, "/sessions/")
	if path == "" {
		http.NotFound(w, r)
		return
	}

	parts := strings.Split(path, "/")
	id := parts[0]

	// /sessions/{id}/clip
	if len(parts) == 2 && parts[1] == "clip" {
		s.handleClip(w, r, id)
		return
	}

	if len(parts) >= 3 && parts[1] == "stream" {
		// /sessions/{id}/stream/{asset}
		asset := strings.Join(parts[2:], "/")
		s.handleStreamAsset(w, r, id, asset)
		return
	}

	// /sessions/{id}
	if len(parts) == 1 {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		s.handleGetSession(w, r, id)
		return
	}

	// /sessions/{id}/stream
	if len(parts) == 2 && parts[1] == "stream" {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		s.handleStreamSession(w, r, id)
		return
	}

	// /sessions/{id}/audio
	if len(parts) == 2 && parts[1] == "audio" {
		s.handleAudioTrack(w, r, id)
		return
	}

	// /sessions/{id}/subtitles/{index}
	if len(parts) == 3 && parts[1] == "subtitles" {
		s.handleSubtitleTrack(w, r, id, parts[2])
		return
	}

	http.NotFound(w, r)
}

func (s *Server) handleGetSession(w http.ResponseWriter, r *http.Request, id string) {
	sess, err := s.sessions.Get(id)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if r.URL.Query().Get("playback") == "1" && s.hlsController != nil {
		s.hlsController.SetBufferAheadLimit(sess.ID, hls.MaxBufferAhead)
	}

	if sess.Kind == session.SessionKindHTTP && s.hlsController != nil {
		if audioIdx, streams, ok := s.hlsController.DescribeSession(sess.ID); ok {
			sess.AudioIndex = audioIdx
			if len(streams) > 0 {
				sess.AvailableStreams = streams
			}
		}

		if sess.DurationSeconds == 0 || len(sess.Chapters) == 0 || len(sess.AvailableStreams) == 0 {
			if sess.IsTorrent && sess.TorrentInfoHash != "" {
				status, ok := s.torrentStreamer.GetStatus(sess.TorrentInfoHash)
				if !ok || !status.Ready {
					writeJSON(w, sess)
					return
				}
				if status.PiecesComplete <= 0 {
					writeJSON(w, sess)
					return
				}

				s.probeMu.Lock()
				cooldownUntil := s.probeCooldown[sess.ID]
				s.probeMu.Unlock()
				if !cooldownUntil.IsZero() && time.Now().Before(cooldownUntil) {
					writeJSON(w, sess)
					return
				}
			}

			var meta *hls.Metadata
			var probeErr error
			maxAttempts := 3
			if sess.IsTorrent {
				maxAttempts = 2
			}

			for attempt := 0; attempt < maxAttempts; attempt++ {
				meta, probeErr = s.hlsController.ProbeMetadata(r.Context(), sess.ID, sess.Source)
				if probeErr == nil && meta != nil {
					break
				}
				if attempt < maxAttempts-1 {
					select {
					case <-time.After(time.Duration(200*(attempt+1)) * time.Millisecond):
					case <-r.Context().Done():
						break
					}
				}
			}

			if probeErr == nil && meta != nil {
				s.probeMu.Lock()
				delete(s.probeCooldown, sess.ID)
				s.probeMu.Unlock()

				sess.DurationSeconds = meta.Format.DurationSeconds
				sess.Chapters = make([]session.Chapter, len(meta.Chapters))
				for i, c := range meta.Chapters {
					sess.Chapters[i] = session.Chapter{
						StartTime: c.StartTime,
						EndTime:   c.EndTime,
						Title:     c.Tags.Title,
					}
				}

				streams, preferredIndex := hls.StreamsFromMetadata(meta)
				sess.AvailableStreams = streams
				if len(streams) > 0 {
					sess.AudioIndex = preferredIndex
				}
			} else if probeErr != nil {
				if sess.IsTorrent {
					s.probeMu.Lock()
					s.probeCooldown[sess.ID] = time.Now().Add(20 * time.Second)
					s.probeMu.Unlock()
				}
				log.Printf("metadata probe failed for session %s: %v", sess.ID, probeErr)
			}
		}
	}
	writeJSON(w, sess)
}

func (s *Server) handleStreamSession(w http.ResponseWriter, r *http.Request, id string) {
	sess, err := s.sessions.Get(id)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if asset := r.URL.Query().Get("stream"); asset != "" {
		s.handleHLSSessionAsset(w, r, sess, asset)
		return
	}

	switch sess.Kind {
	case session.SessionKindHTTP:
		s.handleHLSSession(w, r, sess)
	default:
		http.Error(w, "unsupported session type", http.StatusBadRequest)
	}
}

func (s *Server) handleHLSSession(w http.ResponseWriter, r *http.Request, sess *session.Session) {
	s.handleHLSSessionAsset(w, r, sess, "child.m3u8")
}

func (s *Server) handleStreamAsset(w http.ResponseWriter, r *http.Request, id, asset string) {
	sess, err := s.sessions.Get(id)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if sess.Kind != session.SessionKindHTTP {
		http.Error(w, "unsupported asset", http.StatusBadRequest)
		return
	}

	s.handleHLSSessionAsset(w, r, sess, asset)
}

func (s *Server) handleHLSSessionAsset(w http.ResponseWriter, r *http.Request, sess *session.Session, asset string) {
	if asset == "child.m3u8" {
		if s.hlsController != nil {
			s.hlsController.NotifyClientPlaylistRequest(sess.ID)
		}
		start := r.URL.Query().Get("seek")
		seekID := r.URL.Query().Get("seek_id")
		forceSlice := r.URL.Query().Get("force_slice") == "1"

		sliceStart := 0.0
		manifestPath := ""
		if s.hlsController != nil {
			sliceStart = s.hlsController.GetSliceStart(sess.ID)
		}

		if start != "" {
			if val, err := strconv.ParseFloat(start, 64); err == nil && val >= 0 {
				dur, actualStart, readyManifestPath, err := s.hlsController.Seek(r.Context(), sess.ID, sess.Source, val, seekID, forceSlice)
				if err != nil {
					log.Printf("seek error for %s: %v", sess.ID, err)
					http.Error(w, "failed to seek", http.StatusInternalServerError)
					return
				}
				if dur > 0 {
					sess.DurationSeconds = dur
				}
				sliceStart = actualStart
				manifestPath = readyManifestPath
			}
		} else {
			if _, readyManifestPath, err := s.hlsController.EnsureSession(r.Context(), sess.ID, sess.Source, sess.StartTime); err != nil {
				log.Printf("failed to prepare stream for session %s (source=%s): %v", sess.ID, sess.Source, err)
				http.Error(w, "failed to prepare stream", http.StatusInternalServerError)
				return
			} else {
				manifestPath = readyManifestPath
			}
			sliceStart = s.hlsController.GetSliceStart(sess.ID)
		}

		w.Header().Set("X-Raffi-Slice-Start", fmt.Sprintf("%.3f", sliceStart))

		sliceDir := s.hlsController.CurrentSliceDir(sess.ID)
		if sliceDir == "" {
			http.Error(w, "no active slice", http.StatusInternalServerError)
			return
		}
		fullPath := manifestPath
		if fullPath == "" {
			fullPath = filepath.Clean(filepath.Join(sliceDir, asset))
		}

		content, err := os.ReadFile(fullPath)
		if err != nil {
			http.Error(w, "failed to read playlist", http.StatusInternalServerError)
			return
		}

		lines := strings.Split(string(content), "\n")
		if start != "" {
			if val, err := strconv.ParseFloat(start, 64); err == nil && val >= 0 {
				offset := val - sliceStart
				if offset < 0 {
					offset = 0
				}
				tag := fmt.Sprintf("#EXT-X-START:TIME-OFFSET=%.3f,PRECISE=YES", offset)
				if len(lines) > 0 && strings.HasPrefix(lines[0], "#EXTM3U") {
					if len(lines) > 1 {
						lines = append(lines[:1], append([]string{tag}, lines[1:]...)...)
					} else {
						lines = append(lines, tag)
					}
				} else {
					lines = append([]string{tag}, lines...)
				}
			}
		}

		finalContent := strings.Join(lines, "\n")
		w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
		w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")
		http.ServeContent(w, r, asset, time.Now(), strings.NewReader(finalContent))
		return
	}

	if _, _, err := s.hlsController.EnsureSession(r.Context(), sess.ID, sess.Source, sess.StartTime); err != nil {
		log.Printf("failed to prepare stream for session %s (source=%s): %v", sess.ID, sess.Source, err)
		http.Error(w, "failed to prepare stream", http.StatusInternalServerError)
		return
	}

	sliceDir := s.hlsController.CurrentSliceDir(sess.ID)
	if sliceDir == "" {
		http.Error(w, "no active slice", http.StatusInternalServerError)
		return
	}

	fullPath := filepath.Clean(filepath.Join(sliceDir, asset))
	if !strings.HasPrefix(fullPath, sliceDir) {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}

	if s.hlsController != nil {
		ext := strings.ToLower(filepath.Ext(fullPath))
		if ext == ".ts" {
			if _, err := os.Stat(fullPath); errors.Is(err, os.ErrNotExist) {
				s.hlsController.NotifyClientAssetRequest(sess.ID)
			}
		}
	}

	if err := waitForFile(r.Context(), fullPath, func() bool {
		return s.hlsController != nil && s.hlsController.IsProducing(sess.ID)
	}); err != nil {
		log.Printf("segment wait failed for %s: %v", fullPath, err)
		http.Error(w, "segment unavailable", http.StatusServiceUnavailable)
		return
	}

	info, err := os.Stat(fullPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			http.NotFound(w, r)
			return
		}
		http.Error(w, "failed to read asset", http.StatusInternalServerError)
		return
	}
	if info.IsDir() {
		http.Error(w, "invalid asset", http.StatusBadRequest)
		return
	}

	ext := strings.ToLower(filepath.Ext(fullPath))
	if ext == ".ts" {
		s.hlsController.MarkSegmentServed(sess.ID, path.Base(fullPath))
	}

	http.ServeFile(w, r, fullPath)
}

func waitForFile(ctx context.Context, p string, producerActive func() bool) error {
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	for {
		if _, err := os.Stat(p); err == nil {
			return nil
		} else if !errors.Is(err, os.ErrNotExist) {
			return err
		}
		if producerActive != nil && !producerActive() {
			return fmt.Errorf("stream producer stopped before file was ready: %s", p)
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
		}
	}
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := strings.TrimSpace(r.Header.Get("Origin"))
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS, DELETE, HEAD")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Accept-Encoding, Range, Origin, Accept")
		w.Header().Set("Access-Control-Expose-Headers", "X-Raffi-Slice-Start, Accept-Ranges, Content-Range, Content-Length")
		w.Header().Set("Access-Control-Max-Age", "86400")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (s *Server) handleCleanup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost && r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	id := r.URL.Query().Get("id")
	if id == "" {
		var req struct {
			ID string `json:"id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err == nil {
			id = req.ID
		}
	}

	if id == "" {
		http.Error(w, "id required", http.StatusBadRequest)
		return
	}

	log.Printf("Cleaning up session %s", id)

	// Check if this is a torrent session and clean up the torrent
	sess, err := s.sessions.Get(id)
	if err == nil && sess.IsTorrent && sess.TorrentInfoHash != "" {
		log.Printf("Removing torrent %s for session %s", sess.TorrentInfoHash, id)
		s.torrentStreamer.RemoveTorrent(sess.TorrentInfoHash)
	}

	if s.hlsController != nil {
		_ = s.hlsController.StopSession(id)
	}
	_ = s.sessions.Delete(id)
	w.WriteHeader(http.StatusOK)
}
