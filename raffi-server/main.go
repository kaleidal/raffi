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
	"strconv"
	"strings"
	"syscall"
	"time"
)

type Server struct {
	sessions        session.Store
	torrentStreamer *stream.TorrentStreamer
	hlsController   *hls.Controller
}

func main() {
	srv := &Server{
		sessions:        session.NewMemoryStore(),
		torrentStreamer: stream.NewTorrentStreamer(filepath.Join(os.TempDir(), "raffi-torrents")),
		hlsController:   hls.NewController(),
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
		}
	}()

	mux := http.NewServeMux()
	mux.HandleFunc("/sessions", srv.handleSessions)
	mux.HandleFunc("/sessions/", srv.handleSessionByID)
	mux.HandleFunc("/cleanup", srv.handleCleanup)
	mux.HandleFunc("/torrents/", srv.torrentStreamer.ServeHTTP)
	mux.HandleFunc("/community-addons", srv.handleCommunityAddons)

	addr := "127.0.0.1:6969"
	listener, err := net.Listen("tcp4", addr)
	if err != nil {
		log.Fatalf("failed to bind to %s: %v", addr, err)
	}
	log.Printf("Server listening on http://%s (loopback only)\n", listener.Addr().String())
	if err := http.Serve(listener, withCORS(mux)); err != nil {
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

		if !sess.IsTorrent && (sess.DurationSeconds == 0 || len(sess.Chapters) == 0 || len(sess.AvailableStreams) == 0) {
			if meta, err := s.hlsController.ProbeMetadata(r.Context(), sess.ID, sess.Source); err == nil && meta != nil {
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
			} else if err != nil {
				log.Printf("metadata probe failed for session %s: %v", sess.ID, err)
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

		if start != "" {
			if val, err := strconv.ParseFloat(start, 64); err == nil && val >= 0 {
				offset := val - sliceStart
				if offset < 0 {
					offset = 0
				}

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

				tag := fmt.Sprintf("#EXT-X-START:TIME-OFFSET=%.3f,PRECISE=YES\n", offset)
				lines := strings.Split(string(content), "\n")
				if len(lines) > 0 && strings.HasPrefix(lines[0], "#EXTM3U") {
					lines[0] = lines[0] + "\n" + tag
				} else {
					lines = append([]string{tag}, lines...)
				}

				finalContent := strings.Join(lines, "\n")
				w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
				http.ServeContent(w, r, asset, time.Now(), strings.NewReader(finalContent))
				return
			}
		}
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

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Expose-Headers", "X-Raffi-Slice-Start")

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
	w.WriteHeader(http.StatusOK)
}
