package main

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"raffi-server/src/session"
	"strings"
	"sync"
	"time"

	"github.com/grandcat/zeroconf"
)

const bridgeProtocolVersion = 1
const bridgePort = 6970

type pairedDevice struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Platform  string    `json:"platform"`
	TokenHash string    `json:"tokenHash"`
	CreatedAt time.Time `json:"createdAt"`
}

type bridgeConfig struct {
	ID             string         `json:"id"`
	Name           string         `json:"name"`
	Enabled        bool           `json:"enabled"`
	ConsentVersion int            `json:"nearbyConsentVersion,omitempty"`
	Devices        []pairedDevice `json:"devices"`
}

type bridgeChallenge struct {
	Code      string
	ExpiresAt time.Time
}

type bridgePlayback struct {
	OwnerDeviceID string
	AccessToken   string
	ExpiresAt     time.Time
}

type pairAttempts struct {
	Started time.Time
	Count   int
}

type BridgeService struct {
	server     *Server
	mu         sync.RWMutex
	config     bridgeConfig
	challenge  *bridgeChallenge
	playback   map[string]bridgePlayback
	attempts   map[string]pairAttempts
	listener   net.Listener
	httpServer *http.Server
	advertiser *zeroconf.Server
	configPath string
}

func NewBridgeService(server *Server) *BridgeService {
	configDir, _ := os.UserConfigDir()
	host, _ := os.Hostname()
	return &BridgeService{
		server:   server,
		config:   bridgeConfig{ID: randomSecureToken(12), Name: strings.TrimSpace(host) + " · Raffi Desktop"},
		playback: make(map[string]bridgePlayback), attempts: make(map[string]pairAttempts),
		configPath: filepath.Join(configDir, "Raffi", "bridge.json"),
	}
}

func (b *BridgeService) Restore() error {
	b.mu.Lock()
	needsSave := false
	if data, err := os.ReadFile(b.configPath); err == nil {
		var stored bridgeConfig
		if json.Unmarshal(data, &stored) == nil && stored.ID != "" {
			b.config = stored
		}
	}
	// Never bind a LAN socket for legacy/default state. Consent is recorded only
	// by an explicit settings action in handleAdminSettings.
	if b.config.Enabled && b.config.ConsentVersion < 1 {
		b.config.Enabled = false
		needsSave = true
	}
	enabled := b.config.Enabled
	b.mu.Unlock()
	if needsSave {
		_ = b.save()
	}
	if enabled {
		return b.startLAN()
	}
	return nil
}

func (b *BridgeService) RegisterLocalAdmin(mux *http.ServeMux) {
	mux.HandleFunc("/bridge/v1/admin/settings", b.handleAdminSettings)
	mux.HandleFunc("/bridge/v1/admin/challenge", b.handleAdminChallenge)
	mux.HandleFunc("/bridge/v1/admin/devices", b.handleAdminDevices)
}

func (b *BridgeService) publicHandler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/bridge/v1/info", b.handleInfo)
	mux.HandleFunc("/bridge/v1/pair", b.handlePair)
	mux.HandleFunc("/bridge/v1/playback/sessions", b.handlePlaybackSessions)
	mux.HandleFunc("/bridge/v1/playback/sessions/", b.handlePlaybackSession)
	return withBridgeCORS(mux)
}

func (b *BridgeService) startLAN() error {
	b.mu.Lock()
	if b.listener != nil {
		b.mu.Unlock()
		return nil
	}
	listener, err := net.Listen("tcp4", fmt.Sprintf("0.0.0.0:%d", bridgePort))
	if err != nil {
		b.mu.Unlock()
		return err
	}
	server := &http.Server{Handler: b.publicHandler(), ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 60 * time.Second}
	b.listener, b.httpServer = listener, server
	name, id := b.config.Name, b.config.ID
	b.mu.Unlock()
	advertiser, advertiseErr := zeroconf.Register(name, "_raffi._tcp", "local.", bridgePort, []string{"id=" + id, "v=1"}, nil)
	if advertiseErr != nil {
		log.Printf("mDNS advertisement failed: %v", advertiseErr)
	} else {
		b.mu.Lock()
		b.advertiser = advertiser
		b.mu.Unlock()
	}
	go func() {
		if err := server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("bridge server failed: %v", err)
		}
	}()
	log.Printf("Nearby-device bridge listening on %s", listener.Addr())
	return nil
}

func (b *BridgeService) stopLAN() {
	b.mu.Lock()
	server, listener, advertiser := b.httpServer, b.listener, b.advertiser
	b.httpServer, b.listener, b.advertiser = nil, nil, nil
	b.mu.Unlock()
	if advertiser != nil {
		advertiser.Shutdown()
	}
	if server != nil {
		_ = server.Close()
	} else if listener != nil {
		_ = listener.Close()
	}
}

func (b *BridgeService) save() error {
	b.mu.RLock()
	data, err := json.MarshalIndent(b.config, "", "  ")
	b.mu.RUnlock()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(b.configPath), 0o700); err != nil {
		return err
	}
	return os.WriteFile(b.configPath, data, 0o600)
}

func (b *BridgeService) info() map[string]any {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return map[string]any{"protocolVersion": bridgeProtocolVersion, "id": b.config.ID, "name": b.config.Name, "pairingRequired": true, "capabilities": []string{"http", "torrent", "hls", "subtitles"}}
}

func (b *BridgeService) handleInfo(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	writeJSON(w, b.info())
}

func (b *BridgeService) handleAdminSettings(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		b.mu.RLock()
		enabled := b.config.Enabled
		b.mu.RUnlock()
		writeJSON(w, map[string]any{"enabled": enabled, "port": bridgePort})
		return
	}
	if r.Method != http.MethodPut {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Enabled bool `json:"enabled"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}
	b.mu.Lock()
	b.config.Enabled = body.Enabled
	b.config.ConsentVersion = 1
	b.mu.Unlock()
	if body.Enabled {
		if err := b.startLAN(); err != nil {
			b.mu.Lock()
			b.config.Enabled = false
			b.mu.Unlock()
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	} else {
		b.stopLAN()
	}
	_ = b.save()
	writeJSON(w, map[string]any{"enabled": body.Enabled, "port": bridgePort})
}

func (b *BridgeService) handleAdminChallenge(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	code := secureDigits(6)
	expires := time.Now().Add(5 * time.Minute)
	b.mu.Lock()
	b.challenge = &bridgeChallenge{Code: code, ExpiresAt: expires}
	enabled := b.config.Enabled
	b.mu.Unlock()
	if !enabled {
		http.Error(w, "nearby devices are disabled", http.StatusConflict)
		return
	}
	pairURL := fmt.Sprintf("raffi://pair?url=%s&code=%s", url.QueryEscape(fmt.Sprintf("http://%s:%d", primaryLANAddress(), bridgePort)), code)
	writeJSON(w, map[string]any{"code": code, "expiresAt": expires, "pairingUrl": pairURL})
}

func (b *BridgeService) handleAdminDevices(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		b.mu.RLock()
		devices := append([]pairedDevice(nil), b.config.Devices...)
		b.mu.RUnlock()
		for i := range devices {
			devices[i].TokenHash = ""
		}
		writeJSON(w, devices)
		return
	}
	if r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := r.URL.Query().Get("id")
	b.mu.Lock()
	next := b.config.Devices[:0]
	for _, device := range b.config.Devices {
		if device.ID != id {
			next = append(next, device)
		}
	}
	b.config.Devices = next
	b.mu.Unlock()
	_ = b.save()
	w.WriteHeader(http.StatusNoContent)
}

func (b *BridgeService) handlePair(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	remote, _, _ := net.SplitHostPort(r.RemoteAddr)
	if remote == "" {
		remote = r.RemoteAddr
	}
	if !b.allowPairAttempt(remote) {
		http.Error(w, "too many pairing attempts", http.StatusTooManyRequests)
		return
	}
	var body struct{ Challenge, DeviceName, Platform string }
	if json.NewDecoder(r.Body).Decode(&body) != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}
	b.mu.Lock()
	challenge := b.challenge
	if challenge == nil || time.Now().After(challenge.ExpiresAt) || subtle.ConstantTimeCompare([]byte(challenge.Code), []byte(strings.TrimSpace(body.Challenge))) != 1 {
		b.mu.Unlock()
		http.Error(w, "invalid or expired pairing code", http.StatusUnauthorized)
		return
	}
	b.challenge = nil
	token, deviceID := randomSecureToken(32), randomSecureToken(12)
	device := pairedDevice{ID: deviceID, Name: cleanDeviceName(body.DeviceName), Platform: body.Platform, TokenHash: hashToken(token), CreatedAt: time.Now()}
	b.config.Devices = append(b.config.Devices, device)
	b.mu.Unlock()
	_ = b.save()
	writeJSON(w, map[string]any{"deviceId": deviceID, "token": token, "desktop": b.info()})
}

func (b *BridgeService) allowPairAttempt(remote string) bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	now := time.Now()
	attempt := b.attempts[remote]
	if now.Sub(attempt.Started) > time.Minute {
		attempt = pairAttempts{Started: now}
	}
	attempt.Count++
	b.attempts[remote] = attempt
	return attempt.Count <= 5
}

func (b *BridgeService) authenticate(r *http.Request) (string, bool) {
	token := strings.TrimSpace(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
	if token == "" {
		return "", false
	}
	hash := hashToken(token)
	b.mu.RLock()
	defer b.mu.RUnlock()
	for _, device := range b.config.Devices {
		if subtle.ConstantTimeCompare([]byte(hash), []byte(device.TokenHash)) == 1 {
			return device.ID, true
		}
	}
	return "", false
}

func (b *BridgeService) handlePlaybackSessions(w http.ResponseWriter, r *http.Request) {
	deviceID, ok := b.authenticate(r)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Source       string  `json:"source"`
		FileIndex    *int    `json:"fileIndex"`
		StartSeconds float64 `json:"startSeconds"`
		AudioIndex   int     `json:"audioIndex"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil || strings.TrimSpace(body.Source) == "" {
		http.Error(w, "invalid playback request", http.StatusBadRequest)
		return
	}
	source := strings.TrimSpace(body.Source)
	kind := session.SessionKindHTTP
	isTorrent := strings.HasPrefix(source, "magnet:")
	if isTorrent {
		kind = session.SessionKindTorrent
	}
	var sess *session.Session
	var err error
	if kind == session.SessionKindTorrent {
		var streamURL, infoHash string
		streamURL, infoHash, err = b.server.torrentStreamer.AddTorrent(source, body.FileIndex)
		if err == nil {
			sess, err = b.server.sessions.Create(streamURL, session.SessionKindHTTP, body.StartSeconds)
			if err == nil {
				sess.IsTorrent = true
				sess.TorrentInfoHash = infoHash
			}
		}
	} else {
		sess, err = b.server.sessions.Create(source, kind, body.StartSeconds)
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.AudioIndex > 0 {
		sess.AudioIndex = body.AudioIndex
	}
	access := randomSecureToken(24)
	expires := time.Now().Add(6 * time.Hour)
	b.mu.Lock()
	b.playback[sess.ID] = bridgePlayback{OwnerDeviceID: deviceID, AccessToken: access, ExpiresAt: expires}
	b.mu.Unlock()
	playbackURL := fmt.Sprintf("http://%s/bridge/v1/playback/sessions/%s/stream/child.m3u8?access=%s", r.Host, sess.ID, url.QueryEscape(access))
	writeJSON(w, map[string]any{"id": sess.ID, "status": "preparing", "playbackUrl": playbackURL, "expiresAt": expires})
}

func (b *BridgeService) handlePlaybackSession(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/bridge/v1/playback/sessions/")
	parts := strings.Split(path, "/")
	if len(parts) == 0 || parts[0] == "" {
		http.NotFound(w, r)
		return
	}
	id := parts[0]
	if len(parts) >= 3 && parts[1] == "stream" {
		b.handlePlaybackAsset(w, r, id, strings.Join(parts[2:], "/"))
		return
	}
	deviceID, ok := b.authenticate(r)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	b.mu.RLock()
	playback, exists := b.playback[id]
	b.mu.RUnlock()
	if !exists || playback.OwnerDeviceID != deviceID {
		http.NotFound(w, r)
		return
	}
	if r.Method == http.MethodDelete {
		b.cleanupSession(id)
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	writeJSON(w, map[string]any{"id": id, "status": "ready", "expiresAt": playback.ExpiresAt})
}

func (b *BridgeService) handlePlaybackAsset(w http.ResponseWriter, r *http.Request, id, asset string) {
	b.mu.RLock()
	playback, exists := b.playback[id]
	b.mu.RUnlock()
	access := r.URL.Query().Get("access")
	if !exists || time.Now().After(playback.ExpiresAt) || subtle.ConstantTimeCompare([]byte(playback.AccessToken), []byte(access)) != 1 {
		http.Error(w, "media URL expired", http.StatusUnauthorized)
		return
	}
	sess, err := b.server.sessions.Get(id)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	if asset != "child.m3u8" {
		b.server.handleHLSSessionAsset(w, r, sess, asset)
		return
	}
	recorder := httptest.NewRecorder()
	b.server.handleHLSSessionAsset(recorder, r, sess, asset)
	result := recorder.Result()
	defer result.Body.Close()
	for key, values := range result.Header {
		for _, value := range values {
			w.Header().Add(key, value)
		}
	}
	w.WriteHeader(result.StatusCode)
	if result.StatusCode >= 400 {
		_, _ = recorder.Body.WriteTo(w)
		return
	}
	lines := strings.Split(recorder.Body.String(), "\n")
	for i, line := range lines {
		if line != "" && !strings.HasPrefix(line, "#") {
			separator := "?"
			if strings.Contains(line, "?") {
				separator = "&"
			}
			lines[i] = line + separator + "access=" + url.QueryEscape(access)
		}
	}
	_, _ = w.Write([]byte(strings.Join(lines, "\n")))
}

func (b *BridgeService) cleanupSession(id string) {
	b.mu.Lock()
	delete(b.playback, id)
	b.mu.Unlock()
	sess, err := b.server.sessions.Get(id)
	if err == nil && sess.IsTorrent && sess.TorrentInfoHash != "" {
		b.server.torrentStreamer.RemoveTorrent(sess.TorrentInfoHash)
	}
	if b.server.hlsController != nil {
		_ = b.server.hlsController.StopSession(id)
	}
	_ = b.server.sessions.Delete(id)
}

func randomSecureToken(bytes int) string {
	value := make([]byte, bytes)
	if _, err := rand.Read(value); err != nil {
		panic(err)
	}
	return base64.RawURLEncoding.EncodeToString(value)
}
func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
func secureDigits(length int) string {
	value := make([]byte, length)
	_, _ = rand.Read(value)
	for i := range value {
		value[i] = '0' + value[i]%10
	}
	return string(value)
}
func cleanDeviceName(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "Raffi device"
	}
	if len(value) > 80 {
		return value[:80]
	}
	return value
}
func primaryLANAddress() string {
	interfaces, _ := net.Interfaces()
	for _, iface := range interfaces {
		addresses, _ := iface.Addrs()
		for _, address := range addresses {
			ip, _, err := net.ParseCIDR(address.String())
			if err == nil && ip.To4() != nil && !ip.IsLoopback() {
				return ip.String()
			}
		}
	}
	return "127.0.0.1"
}

func withBridgeCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, Range")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
