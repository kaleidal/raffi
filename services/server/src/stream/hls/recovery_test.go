package hls

import (
	"context"
	"errors"
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

func TestPlaylistResumePointRequiresSegments(t *testing.T) {
	manifestPath := filepath.Join(t.TempDir(), "child.m3u8")
	if err := os.WriteFile(manifestPath, []byte("#EXTM3U\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	if _, _, ok := playlistResumePoint(manifestPath, 0); ok {
		t.Fatal("empty playlist should not produce a resume point")
	}
}

func TestBufferedAheadDurationUsesSequenceBaseline(t *testing.T) {
	if got := bufferedAheadDuration(15, 1, 14); got != DefaultSegmentDuration {
		t.Fatalf("one segment at a non-zero sequence = %v, want %v", got, DefaultSegmentDuration)
	}
	if got := bufferedAheadDuration(15, 15, 14); got != MaxBufferAhead {
		t.Fatalf("full buffer at a non-zero sequence = %v, want %v", got, MaxBufferAhead)
	}
}

func TestControllerBufferAheadLimitDefaultsAndOverrides(t *testing.T) {
	controller := &Controller{
		sessions:     make(map[string]*Session),
		bufferLimits: make(map[string]time.Duration),
	}
	if got := controller.bufferAheadLimitLocked("prefetch"); got != MaxBufferAhead {
		t.Fatalf("default buffer limit = %v, want %v", got, MaxBufferAhead)
	}
	controller.SetBufferAheadLimit("prefetch", PrefetchBufferAhead)
	if got := controller.bufferAheadLimitLocked("prefetch"); got != PrefetchBufferAhead {
		t.Fatalf("prefetch buffer limit = %v, want %v", got, PrefetchBufferAhead)
	}
	controller.SetBufferAheadLimit("prefetch", MaxBufferAhead)
	if got := controller.bufferAheadLimitLocked("prefetch"); got != MaxBufferAhead {
		t.Fatalf("promoted buffer limit = %v, want %v", got, MaxBufferAhead)
	}
}

func TestWaitForManifestSegmentsAllowsSeekAfterFirstSegment(t *testing.T) {
	manifestPath := filepath.Join(t.TempDir(), "child.m3u8")
	manifest := "#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:6.0,\nsegment00000.ts\n"
	if err := os.WriteFile(manifestPath, []byte(manifest), 0o600); err != nil {
		t.Fatal(err)
	}

	if err := waitForManifestSegments(context.Background(), manifestPath, nil, 1); err != nil {
		t.Fatalf("seek manifest should be ready after its first segment: %v", err)
	}
}

func TestWaitForManifestSegmentsWaitsForPlaylistCreation(t *testing.T) {
	manifestPath := filepath.Join(t.TempDir(), "child.m3u8")
	written := make(chan error, 1)
	go func() {
		time.Sleep(25 * time.Millisecond)
		manifest := "#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:6.0,\nsegment00000.ts\n"
		written <- os.WriteFile(manifestPath, []byte(manifest), 0o600)
	}()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := waitForManifestSegments(ctx, manifestPath, nil, 1); err != nil {
		t.Fatalf("manifest wait returned before playlist creation: %v", err)
	}
	if err := <-written; err != nil {
		t.Fatalf("write manifest: %v", err)
	}
}

func TestWaitForManifestSegmentsStopsWhenRequestIsCanceled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	err := waitForManifestSegments(ctx, filepath.Join(t.TempDir(), "missing.m3u8"), nil, 1)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("wait error = %v, want context cancellation", err)
	}
}
