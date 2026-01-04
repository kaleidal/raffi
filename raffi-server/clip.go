package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

func (s *Server) handleClip(w http.ResponseWriter, r *http.Request, id string) {
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Start float64 `json:"start"`
		End   float64 `json:"end"`
		Name  string  `json:"name,omitempty"`
		// Optional absolute output file path (renderer Save-As). If omitted, server chooses a default clips dir.
		OutputPath string `json:"outputPath,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}

	if req.Start < 0 || req.End <= 0 || req.End <= req.Start {
		http.Error(w, "invalid start/end", http.StatusBadRequest)
		return
	}

	sess, err := s.sessions.Get(id)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	input := strings.TrimSpace(sess.Source)
	if input == "" {
		http.Error(w, "missing session source", http.StatusBadRequest)
		return
	}

	clipDur := req.End - req.Start
	// Conservative limits: allow longer clips for local files.
	maxDur := 900.0
	if !strings.HasPrefix(input, "http://") && !strings.HasPrefix(input, "https://") {
		maxDur = 3600.0
	}
	if clipDur > maxDur {
		http.Error(w, fmt.Sprintf("clip too long (max %.0fs)", maxDur), http.StatusBadRequest)
		return
	}

	outputPath := strings.TrimSpace(req.OutputPath)
	if outputPath == "" {
		clipsDir, derr := defaultClipsDir()
		if derr != nil {
			http.Error(w, fmt.Sprintf("failed to resolve clips dir: %v", derr), http.StatusInternalServerError)
			return
		}
		if err := os.MkdirAll(clipsDir, 0o755); err != nil {
			http.Error(w, fmt.Sprintf("failed to create clips dir: %v", err), http.StatusInternalServerError)
			return
		}

		baseName := strings.TrimSpace(req.Name)
		if baseName == "" {
			baseName = fmt.Sprintf("clip_%s", time.Now().Format("20060102_150405"))
		}
		baseName = sanitizeFilename(baseName)
		if !strings.HasSuffix(strings.ToLower(baseName), ".mp4") {
			baseName += ".mp4"
		}
		outputPath = filepath.Join(clipsDir, baseName)
	} else {
		// Ensure directory exists when a full path is provided.
		if !strings.HasSuffix(strings.ToLower(outputPath), ".mp4") {
			outputPath += ".mp4"
		}
		outDir := filepath.Dir(outputPath)
		if err := os.MkdirAll(outDir, 0o755); err != nil {
			http.Error(w, fmt.Sprintf("failed to create output dir: %v", err), http.StatusInternalServerError)
			return
		}
	}

	// Timeout: duration-scaled but capped.
	timeout := 2*time.Minute + time.Duration(clipDur*5)*time.Second
	if timeout > 60*time.Minute {
		timeout = 60 * time.Minute
	}
	ctx, cancel := context.WithTimeout(r.Context(), timeout)
	defer cancel()

	args := []string{"-y", "-hide_banner", "-loglevel", "error"}
	if strings.HasPrefix(input, "http://") || strings.HasPrefix(input, "https://") {
		args = append(args,
			"-reconnect", "1",
			"-reconnect_at_eof", "1",
			"-reconnect_streamed", "1",
			"-reconnect_delay_max", "5",
		)
	}

	// Place -ss/-to before -i for speed.
	audioMap := "0:a:0?"
	if sess.AudioIndex > 0 {
		audioMap = fmt.Sprintf("0:a:%d?", sess.AudioIndex)
	}
	args = append(args,
		"-ss", fmt.Sprintf("%.3f", req.Start),
		"-to", fmt.Sprintf("%.3f", req.End),
		"-i", input,
		"-map", "0:v:0",
		"-map", audioMap,
		"-c:v", "libx264",
		"-preset", "veryfast",
		"-crf", "23",
		"-pix_fmt", "yuv420p",
		"-profile:v", "main",
		"-level:v", "4.1",
		"-tune", "fastdecode",
		"-tag:v", "avc1",
		"-c:a", "aac",
		"-ac", "2",
		"-ar", "48000",
		"-b:a", "160k",
		"-movflags", "+faststart",
		outputPath,
	)

	cmd := exec.CommandContext(ctx, "ffmpeg", args...)
	var stderr bytes.Buffer
	cmd.Stdout = os.Stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		errText := strings.TrimSpace(stderr.String())
		if errText == "" {
			errText = err.Error()
		}
		http.Error(w, fmt.Sprintf("ffmpeg failed: %s", errText), http.StatusInternalServerError)
		return
	}

	writeJSON(w, struct {
		OutputPath string `json:"outputPath"`
	}{OutputPath: outputPath})
}

func defaultClipsDir() (string, error) {
	// Prefer OS config dir; fall back to temp.
	if dir, err := os.UserConfigDir(); err == nil && dir != "" {
		return filepath.Join(dir, "Raffi", "clips"), nil
	}
	return filepath.Join(os.TempDir(), "raffi", "clips"), nil
}

func sanitizeFilename(name string) string {
	name = strings.TrimSpace(name)
	name = strings.ReplaceAll(name, "\\", "_")
	name = strings.ReplaceAll(name, "/", "_")
	name = strings.ReplaceAll(name, ":", "_")
	name = strings.ReplaceAll(name, "*", "_")
	name = strings.ReplaceAll(name, "?", "_")
	name = strings.ReplaceAll(name, "\"", "_")
	name = strings.ReplaceAll(name, "<", "_")
	name = strings.ReplaceAll(name, ">", "_")
	name = strings.ReplaceAll(name, "|", "_")
	name = strings.Trim(name, ". ")
	if name == "" {
		return "clip"
	}
	return name
}
