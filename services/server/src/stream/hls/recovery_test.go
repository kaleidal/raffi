package hls

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestPlaylistResumePoint(t *testing.T) {
	manifestPath := filepath.Join(t.TempDir(), "child.m3u8")
	manifest := "#EXTM3U\n" +
		"#EXT-X-MEDIA-SEQUENCE:7\n" +
		"#EXTINF:6.0,\nsegment00007.ts\n" +
		"#EXTINF:5.5,\nsegment00008.ts\n"
	if err := os.WriteFile(manifestPath, []byte(manifest), 0o600); err != nil {
		t.Fatal(err)
	}

	resumeTime, nextSequence, ok := playlistResumePoint(manifestPath, 100)
	if !ok {
		t.Fatal("expected a resume point")
	}
	if resumeTime != 111.5 {
		t.Fatalf("resume time = %v, want 111.5", resumeTime)
	}
	if nextSequence != 9 {
		t.Fatalf("next sequence = %d, want 9", nextSequence)
	}
}

func TestThrottleUsesConfiguredActivePortion(t *testing.T) {
	base := time.Unix(0, 0)
	if !throttleAllowsWork(base.Add(throttleActivePortion - time.Millisecond)) {
		t.Fatal("expected work inside the active throttle window")
	}
	if throttleAllowsWork(base.Add(throttleActivePortion)) {
		t.Fatal("expected throttling after the active window")
	}
}

func TestPlaylistResumePointRequiresSegments(t *testing.T) {
	manifestPath := filepath.Join(t.TempDir(), "child.m3u8")
	if err := os.WriteFile(manifestPath, []byte("#EXTM3U\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	if _, _, ok := playlistResumePoint(manifestPath, 0); ok {
		t.Fatal("empty playlist should not produce a resume point")
	}
}

func TestRemoteHTTPSourceExcludesTorrentLoopback(t *testing.T) {
	tests := []struct {
		source string
		want   bool
	}{
		{source: "https://example.com/video.mkv", want: true},
		{source: "http://127.0.0.1:6969/torrents/abc123", want: false},
		{source: `C:\\Videos\\movie.mkv`, want: false},
	}

	for _, test := range tests {
		if got := isRemoteHTTPSource(test.source); got != test.want {
			t.Errorf("isRemoteHTTPSource(%q) = %v, want %v", test.source, got, test.want)
		}
	}
}

func TestRemoteHTTPSourceRecognizesDebridURL(t *testing.T) {
	if !isRemoteHTTPSource("https://download.example-debrid.test/path/movie.mkv?token=abc") {
		t.Fatal("expected a debrid HTTPS URL to use remote HTTP throttling")
	}
}
