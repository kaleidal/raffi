package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func testBridge(t *testing.T) *BridgeService {
	t.Helper()
	b := NewBridgeService(nil)
	b.configPath = filepath.Join(t.TempDir(), "bridge.json")
	b.config.Enabled = true
	return b
}

func pairRequest(t *testing.T, b *BridgeService, code string) (*httptest.ResponseRecorder, map[string]any) {
	t.Helper()
	body, err := json.Marshal(map[string]string{"challenge": code, "deviceName": "Test phone", "platform": "ios"})
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/bridge/v1/pair", bytes.NewReader(body))
	req.RemoteAddr = "192.0.2.10:42000"
	res := httptest.NewRecorder()
	b.handlePair(res, req)
	decoded := map[string]any{}
	_ = json.Unmarshal(res.Body.Bytes(), &decoded)
	return res, decoded
}

func TestPairingIsSingleUseAndStoresOnlyTokenHash(t *testing.T) {
	b := testBridge(t)
	b.challenge = &bridgeChallenge{Code: "123456", ExpiresAt: time.Now().Add(time.Minute)}

	res, paired := pairRequest(t, b, "123456")
	if res.Code != http.StatusOK {
		t.Fatalf("pairing failed: %d %s", res.Code, res.Body.String())
	}
	token, _ := paired["token"].(string)
	if token == "" || len(b.config.Devices) != 1 || b.config.Devices[0].TokenHash == token {
		t.Fatal("expected a credential response and a hashed persisted token")
	}

	res, _ = pairRequest(t, b, "123456")
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("single-use code was accepted twice: %d", res.Code)
	}

	req := httptest.NewRequest(http.MethodGet, "/bridge/v1/playback/sessions/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	if id, ok := b.authenticate(req); !ok || id != b.config.Devices[0].ID {
		t.Fatal("issued bearer token did not authenticate")
	}
}

func TestRestoreRequiresExplicitNearbyConsent(t *testing.T) {
	b := testBridge(t)
	legacy := bridgeConfig{ID: "desktop", Name: "Desktop", Enabled: true}
	data, err := json.Marshal(legacy)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(b.configPath, data, 0o600); err != nil {
		t.Fatal(err)
	}

	if err := b.Restore(); err != nil {
		t.Fatal(err)
	}
	b.mu.RLock()
	enabled, listener := b.config.Enabled, b.listener
	b.mu.RUnlock()
	if enabled || listener != nil {
		t.Fatal("legacy/default state opened the LAN bridge without explicit consent")
	}
}

func TestPairingRejectsExpiredChallenge(t *testing.T) {
	b := testBridge(t)
	b.challenge = &bridgeChallenge{Code: "123456", ExpiresAt: time.Now().Add(-time.Second)}
	res, _ := pairRequest(t, b, "123456")
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("expired challenge returned %d", res.Code)
	}
}

func TestPairingRateLimit(t *testing.T) {
	b := testBridge(t)
	for i := 0; i < 5; i++ {
		if !b.allowPairAttempt("192.0.2.20") {
			t.Fatalf("attempt %d was denied too early", i+1)
		}
	}
	if b.allowPairAttempt("192.0.2.20") {
		t.Fatal("sixth pairing attempt should be rate limited")
	}
}

func TestPlaybackSessionOwnership(t *testing.T) {
	b := testBridge(t)
	b.config.Devices = []pairedDevice{
		{ID: "owner", TokenHash: hashToken("owner-token")},
		{ID: "other", TokenHash: hashToken("other-token")},
	}
	b.playback["session"] = bridgePlayback{OwnerDeviceID: "owner", ExpiresAt: time.Now().Add(time.Hour)}

	request := func(token string) int {
		req := httptest.NewRequest(http.MethodGet, "/bridge/v1/playback/sessions/session", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		res := httptest.NewRecorder()
		b.handlePlaybackSession(res, req)
		return res.Code
	}
	if got := request("owner-token"); got != http.StatusOK {
		t.Fatalf("owner received %d", got)
	}
	if got := request("other-token"); got != http.StatusNotFound {
		t.Fatalf("another device learned session status: %d", got)
	}
	if got := request("invalid"); got != http.StatusUnauthorized {
		t.Fatalf("invalid token returned %d", got)
	}
}

func TestExpiredMediaURLAndPublicAdminAccessAreRejected(t *testing.T) {
	b := testBridge(t)
	b.playback["session"] = bridgePlayback{OwnerDeviceID: "owner", AccessToken: "secret", ExpiresAt: time.Now().Add(-time.Second)}

	req := httptest.NewRequest(http.MethodGet, "/bridge/v1/playback/sessions/session/stream/child.m3u8?access=secret", nil)
	res := httptest.NewRecorder()
	b.handlePlaybackSession(res, req)
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("expired media URL returned %d", res.Code)
	}

	req = httptest.NewRequest(http.MethodGet, "/bridge/v1/admin/settings", nil)
	res = httptest.NewRecorder()
	b.publicHandler().ServeHTTP(res, req)
	if res.Code != http.StatusNotFound {
		t.Fatalf("LAN handler exposed local settings: %d", res.Code)
	}
}
