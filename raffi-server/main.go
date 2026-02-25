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
	"os/signal"
	"path"
	"path/filepath"
	"raffi-server/src/session"
	"raffi-server/src/stream"
	"raffi-server/src/stream/hls"
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
	probeMu         sync.Mutex
	probeCooldown   map[string]time.Time
	castMu          sync.RWMutex
	castTokens      map[string]CastToken
}

func main() {
	debug.SetTraceback("single")

	srv := &Server{
		sessions:        session.NewMemoryStore(),
		torrentStreamer: stream.NewTorrentStreamer(filepath.Join(os.TempDir(), "raffi-torrents")),
		hlsController:   hls.NewController(),
		probeCooldown:   make(map[string]time.Time),
		castTokens:      make(map[string]CastToken),
	}

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
			srv.cleanupExpiredCastTokens()
		}
	}()

	mux := http.NewServeMux()
	mux.HandleFunc("/sessions", srv.handleSessions)
	mux.HandleFunc("/sessions/", srv.handleSessionByID)
	mux.HandleFunc("/cast/token", srv.handleCastToken)
	mux.HandleFunc("/cleanup", srv.handleCleanup)
	mux.HandleFunc("/torrents/", srv.torrentStreamer.ServeHTTP)
	mux.HandleFunc("/community-addons", srv.handleCommunityAddons)

	addr := strings.TrimSpace(os.Getenv("RAFFI_SERVER_ADDR"))
	if addr == "" {
		addr = "127.0.0.1:6969"
	}
	listener, err := net.Listen("tcp4", addr)
	if err != nil {
		log.Fatalf("failed to bind to %s: %v", addr, err)
	}
	if strings.HasPrefix(addr, "127.") {
		log.Printf("Server listening on http://%s (loopback only)\n", listener.Addr().String())
	} else {
		log.Printf("Server listening on http://%s (LAN mode with cast token guard)\n", listener.Addr().String())
	}
	if err := http.Serve(listener, withCORS(withLANGuard(srv, mux))); err != nil {
		log.Fatal(err)
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

	writeJSON(w, struct {
		ID string `json:"id"`
	}{ID: sess.ID})
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

	http.NotFound(w, r)
}

func (s *Server) handleGetSession(w http.ResponseWriter, r *http.Request, id string) {
	sess, err := s.sessions.Get(id)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
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
			probeTimeout := 12 * time.Second
			if sess.IsTorrent {
				maxAttempts = 2
				probeTimeout = 30 * time.Second
			}

			for attempt := 0; attempt < maxAttempts; attempt++ {
				ctx := r.Context()
				ctx, cancel := context.WithTimeout(ctx, probeTimeout)
				meta, probeErr = s.hlsController.ProbeMetadata(ctx, sess.ID, sess.Source)
				cancel()
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

				sess.AvailableStreams = nil
				audioCount := 0
				preferredIndex := 0
				foundEng := false
				for _, st := range meta.Streams {
					if st.CodecType == "audio" {
						sess.AvailableStreams = append(sess.AvailableStreams, session.StreamInfo{
							Index:    audioCount,
							Type:     "audio",
							Codec:    st.CodecName,
							Language: st.Tags.Language,
							Title:    st.Tags.Title,
						})
						if !foundEng && strings.EqualFold(st.Tags.Language, "eng") {
							preferredIndex = audioCount
							foundEng = true
						}
						audioCount++
					}
				}
				if len(sess.AvailableStreams) > 0 {
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
	if _, _, err := s.hlsController.EnsureSession(r.Context(), sess.ID, sess.Source, sess.StartTime); err != nil {
		http.Error(w, "failed to prepare stream", http.StatusInternalServerError)
		return
	}
	castToken := castTokenFromRequest(r)

	if asset == "child.m3u8" {
		start := r.URL.Query().Get("seek")
		seekID := r.URL.Query().Get("seek_id")
		forceSlice := r.URL.Query().Get("force_slice") == "1"

		sliceStart := 0.0
		if s.hlsController != nil {
			sliceStart = s.hlsController.GetSliceStart(sess.ID)
		}

		if start != "" {
			if val, err := strconv.ParseFloat(start, 64); err == nil && val >= 0 {
				log.Printf("Calling Seek with val=%.2f", val)
				log.Printf("Seeking session %s to %.2f seconds (seekID=%s)", sess.ID, val, seekID)
				dur, actualStart, _, err := s.hlsController.Seek(r.Context(), sess.ID, sess.Source, val, seekID, forceSlice)
				if err != nil {
					log.Printf("seek error for %s: %v", sess.ID, err)
					http.Error(w, "failed to seek", http.StatusInternalServerError)
					return
				}
				if dur > 0 {
					sess.DurationSeconds = dur
				}
				log.Printf("Seek returned actualStart=%.2f", actualStart)
				sliceStart = actualStart
			}
		}

		w.Header().Set("X-Raffi-Slice-Start", fmt.Sprintf("%.3f", sliceStart))

		sliceDir := s.hlsController.CurrentSliceDir(sess.ID)
		if sliceDir == "" {
			http.Error(w, "no active slice", http.StatusInternalServerError)
			return
		}
		fullPath := filepath.Clean(filepath.Join(sliceDir, asset))

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

		if castToken != "" {
			for i, line := range lines {
				lines[i] = rewritePlaylistLineWithCastToken(line, castToken)
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
			s.hlsController.NotifyClientAssetRequest(sess.ID)
		}
	}

	if err := waitForFile(r.Context(), fullPath, 20*time.Second); err != nil {
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

func waitForFile(ctx context.Context, p string, timeout time.Duration) error {
	deadline := time.NewTimer(timeout)
	ticker := time.NewTicker(100 * time.Millisecond)
	defer deadline.Stop()
	defer ticker.Stop()

	for {
		if _, err := os.Stat(p); err == nil {
			return nil
		} else if !errors.Is(err, os.ErrNotExist) {
			return err
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-deadline.C:
			if _, err := os.Stat(p); err == nil {
				return nil
			}
			return fmt.Errorf("timeout waiting for file: %s", p)
		case <-ticker.C:
		}
	}
}

func addCastTokenToURL(rawURL string, castToken string) string {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" || castToken == "" {
		return rawURL
	}
	if strings.Contains(rawURL, "cast_token=") {
		return rawURL
	}
	sep := "?"
	if strings.Contains(rawURL, "?") {
		sep = "&"
	}
	return rawURL + sep + "cast_token=" + castToken
}

func rewritePlaylistLineWithCastToken(line string, castToken string) string {
	trimmed := strings.TrimSpace(line)
	if trimmed == "" || castToken == "" {
		return line
	}

	if strings.HasPrefix(trimmed, "#") {
		uriStart := strings.Index(line, "URI=\"")
		if uriStart == -1 {
			return line
		}
		valueStart := uriStart + len("URI=\"")
		valueEndRel := strings.Index(line[valueStart:], "\"")
		if valueEndRel == -1 {
			return line
		}
		valueEnd := valueStart + valueEndRel
		uriValue := line[valueStart:valueEnd]
		patched := addCastTokenToURL(uriValue, castToken)
		if patched == uriValue {
			return line
		}
		return line[:valueStart] + patched + line[valueEnd:]
	}

	return addCastTokenToURL(trimmed, castToken)
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
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE, HEAD")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Accept-Encoding, Range, Origin, Accept, X-Raffi-Cast-Token")
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
