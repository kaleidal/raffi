package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

type communityAddonsCache struct {
	mu      sync.Mutex
	fetched time.Time
	payload []byte
	lastErr string
}

var communityCache communityAddonsCache

// GET /community-addons
// Proxies Stremio community addon catalogs server-side to avoid renderer CORS limitations.
// Response is a JSON array (same general shape as stremio-addons.com/catalog.json).
func (s *Server) handleCommunityAddons(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	communityCache.mu.Lock()
	if communityCache.payload != nil && time.Since(communityCache.fetched) < 30*time.Minute {
		payload := communityCache.payload
		communityCache.mu.Unlock()
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "public, max-age=1800")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(payload)
		return
	}
	communityCache.mu.Unlock()

	upstreams := []string{
		"https://api.strem.io/addonscollection.json",
		"https://stremio-addons.com/catalog.json",
	}

	client := &http.Client{Timeout: 25 * time.Second}
	var merged []any
	var lastErr error

	for _, u := range upstreams {
		req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, u, nil)
		if err != nil {
			lastErr = err
			continue
		}
		req.Header.Set("Accept", "application/json")

		resp, err := client.Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		body, readErr := io.ReadAll(resp.Body)
		_ = resp.Body.Close()
		if readErr != nil {
			lastErr = readErr
			continue
		}
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			lastErr = fmt.Errorf("upstream %s returned %d", u, resp.StatusCode)
			continue
		}

		var arr []any
		if err := json.Unmarshal(body, &arr); err != nil {
			lastErr = fmt.Errorf("invalid JSON from %s: %w", u, err)
			continue
		}
		merged = append(merged, arr...)
	}

	if len(merged) == 0 {
		msg := "failed to fetch community addons"
		if lastErr != nil {
			msg = msg + ": " + lastErr.Error()
		}
		http.Error(w, msg, http.StatusBadGateway)
		communityCache.mu.Lock()
		communityCache.lastErr = msg
		communityCache.mu.Unlock()
		return
	}

	// Deduplicate by transportUrl/transport_url then manifest.id.
	seen := make(map[string]struct{}, len(merged))
	deduped := make([]any, 0, len(merged))
	for _, raw := range merged {
		obj, ok := raw.(map[string]any)
		if !ok {
			continue
		}

		transport := ""
		if v, ok := obj["transportUrl"].(string); ok {
			transport = strings.TrimSpace(v)
		} else if v, ok := obj["transport_url"].(string); ok {
			transport = strings.TrimSpace(v)
		}
		key := transport

		if key == "" {
			if m, ok := obj["manifest"].(map[string]any); ok {
				if id, ok := m["id"].(string); ok {
					key = strings.TrimSpace(id)
				}
			}
		}
		if key == "" {
			continue
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		deduped = append(deduped, obj)
	}

	payload, err := json.Marshal(deduped)
	if err != nil {
		http.Error(w, "failed to encode response", http.StatusInternalServerError)
		return
	}

	communityCache.mu.Lock()
	communityCache.payload = payload
	communityCache.fetched = time.Now()
	communityCache.lastErr = ""
	communityCache.mu.Unlock()

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=1800")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(payload)
}
