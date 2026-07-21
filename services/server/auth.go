package main

import (
	"crypto/subtle"
	"encoding/json"
	"net/http"
	"os"
	"strings"
)

const decoderAuthHeader = "X-Raffi-Auth"

func decoderSecret() string {
	return strings.TrimSpace(os.Getenv("RAFFI_DECODER_SECRET"))
}

func extractAuthToken(r *http.Request) string {
	if token := strings.TrimSpace(r.Header.Get(decoderAuthHeader)); token != "" {
		return token
	}
	auth := strings.TrimSpace(r.Header.Get("Authorization"))
	if auth == "" {
		return ""
	}
	const bearer = "Bearer "
	if strings.HasPrefix(strings.ToLower(auth), strings.ToLower(bearer)) {
		return strings.TrimSpace(auth[len(bearer):])
	}
	return auth
}

func authMatches(provided string) bool {
	secret := decoderSecret()
	if secret == "" || provided == "" {
		return false
	}
	if len(secret) != len(provided) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(secret), []byte(provided)) == 1
}

func requireDecoderAuth(w http.ResponseWriter, r *http.Request) bool {
	if authMatches(extractAuthToken(r)) {
		return true
	}
	http.Error(w, "unauthorized", http.StatusUnauthorized)
	return false
}

func pathRequiresAuth(r *http.Request) bool {
	if r.Method == http.MethodOptions || r.Method == http.MethodHead {
		return false
	}

	path := r.URL.Path
	if path == "/" {
		return false
	}

	// HLS media assets must stay reachable without custom headers (video / HLS.js).
	if strings.HasPrefix(path, "/sessions/") {
		rest := strings.TrimPrefix(path, "/sessions/")
		parts := strings.Split(rest, "/")
		if len(parts) >= 2 && parts[1] == "stream" {
			return false
		}
		if len(parts) == 1 && r.Method == http.MethodGet {
			// Session info exposes source URLs — require auth.
			return true
		}
		if len(parts) >= 2 && (parts[1] == "clip" || parts[1] == "audio" || parts[1] == "subtitles") {
			return true
		}
		return true
	}

	if path == "/sessions" || path == "/cleanup" || strings.HasPrefix(path, "/settings/") {
		return true
	}

	if strings.HasPrefix(path, "/torrents/") {
		return true
	}

	// Community addon catalog is non-mutating and public within the app.
	if path == "/community-addons" && r.Method == http.MethodGet {
		return false
	}

	return r.Method != http.MethodGet
}

func withAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if pathRequiresAuth(r) && !requireDecoderAuth(w, r) {
			return
		}
		next.ServeHTTP(w, r)
	})
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	secretConfigured := decoderSecret() != ""
	verified := secretConfigured && authMatches(extractAuthToken(r))

	payload := map[string]any{
		"ok":               true,
		"service":          "raffi-decoder",
		"secretConfigured": secretConfigured,
		"verified":         verified,
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(payload)
}
