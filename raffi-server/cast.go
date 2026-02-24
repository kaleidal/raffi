package main

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"net"
	"net/http"
	"strings"
	"time"
)

type CastToken struct {
	SessionID string
	ExpiresAt time.Time
}

func (s *Server) cleanupExpiredCastTokens() {
	now := time.Now()
	s.castMu.Lock()
	defer s.castMu.Unlock()
	for token, grant := range s.castTokens {
		if now.After(grant.ExpiresAt) {
			delete(s.castTokens, token)
		}
	}
}

func randomToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func parseClientIP(r *http.Request) net.IP {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return nil
	}
	return net.ParseIP(host)
}

func isLoopbackRequest(r *http.Request) bool {
	ip := parseClientIP(r)
	if ip == nil {
		return false
	}
	return ip.IsLoopback()
}

func castTokenFromRequest(r *http.Request) string {
	if token := strings.TrimSpace(r.URL.Query().Get("cast_token")); token != "" {
		return token
	}
	return strings.TrimSpace(r.Header.Get("X-Raffi-Cast-Token"))
}

func (s *Server) validateCastToken(token, sessionID string) bool {
	if token == "" || sessionID == "" {
		return false
	}
	s.castMu.RLock()
	grant, ok := s.castTokens[token]
	s.castMu.RUnlock()
	if !ok {
		return false
	}
	if time.Now().After(grant.ExpiresAt) {
		s.castMu.Lock()
		delete(s.castTokens, token)
		s.castMu.Unlock()
		return false
	}
	return grant.SessionID == sessionID
}

func parseSessionIDFromPath(urlPath string) string {
	trimmed := strings.TrimPrefix(urlPath, "/sessions/")
	if trimmed == "" || trimmed == urlPath {
		return ""
	}
	parts := strings.Split(trimmed, "/")
	if len(parts) == 0 {
		return ""
	}
	return strings.TrimSpace(parts[0])
}

func isAllowedCastRoute(path string, method string) bool {
	if method != http.MethodGet {
		return false
	}
	trimmed := strings.TrimPrefix(path, "/sessions/")
	if trimmed == "" || trimmed == path {
		return false
	}
	parts := strings.Split(trimmed, "/")
	if len(parts) == 1 {
		return true
	}
	if len(parts) >= 2 && parts[1] == "stream" {
		return true
	}
	return false
}

func withLANGuard(s *Server, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isLoopbackRequest(r) {
			next.ServeHTTP(w, r)
			return
		}

		if !strings.HasPrefix(r.URL.Path, "/sessions/") {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		if !isAllowedCastRoute(r.URL.Path, r.Method) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		sessionID := parseSessionIDFromPath(r.URL.Path)
		if !s.validateCastToken(castTokenFromRequest(r), sessionID) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (s *Server) handleCastToken(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !isLoopbackRequest(r) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	var req struct {
		SessionID  string `json:"sessionId"`
		TTLSeconds int    `json:"ttlSeconds"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}
	req.SessionID = strings.TrimSpace(req.SessionID)
	if req.SessionID == "" {
		http.Error(w, "sessionId is required", http.StatusBadRequest)
		return
	}
	if _, err := s.sessions.Get(req.SessionID); err != nil {
		http.Error(w, "session not found", http.StatusNotFound)
		return
	}

	ttl := time.Duration(req.TTLSeconds) * time.Second
	if ttl <= 0 {
		ttl = 15 * time.Minute
	}
	if ttl < 30*time.Second {
		ttl = 30 * time.Second
	}
	if ttl > time.Hour {
		ttl = time.Hour
	}

	token, err := randomToken()
	if err != nil {
		http.Error(w, "failed to create token", http.StatusInternalServerError)
		return
	}
	expiresAt := time.Now().Add(ttl)

	s.castMu.Lock()
	s.castTokens[token] = CastToken{SessionID: req.SessionID, ExpiresAt: expiresAt}
	s.castMu.Unlock()

	writeJSON(w, struct {
		Token     string    `json:"token"`
		ExpiresAt time.Time `json:"expiresAt"`
	}{
		Token:     token,
		ExpiresAt: expiresAt,
	})
}
