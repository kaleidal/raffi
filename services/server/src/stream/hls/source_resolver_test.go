package hls

import (
	"context"
	"net"
	"testing"
)

func TestResolvePlaybackSourceLeavesOtherURLsAlone(t *testing.T) {
	source := "https://example.com/video.mkv"
	resolved, err := ResolvePlaybackSource(context.Background(), source)
	if err != nil {
		t.Fatal(err)
	}
	if resolved != source {
		t.Fatalf("resolved source = %q, want %q", resolved, source)
	}
}

func TestPreferredCometAddressesUsesOneAddressPerFamily(t *testing.T) {
	addresses := []net.IPAddr{
		{IP: net.ParseIP("192.0.2.1")},
		{IP: net.ParseIP("2001:db8::1")},
		{IP: net.ParseIP("192.0.2.2")},
		{IP: net.ParseIP("2001:db8::2")},
	}
	preferred := preferredCometAddresses(addresses)
	if len(preferred) != 2 {
		t.Fatalf("preferred address count = %d, want 2", len(preferred))
	}
	if preferred[0].IP.To4() != nil {
		t.Fatal("IPv6 address should be preferred first")
	}
	if preferred[1].IP.To4() == nil {
		t.Fatal("IPv4 address should be the fallback")
	}
}

func TestCometErrorSlateDetection(t *testing.T) {
	for _, location := range []string{
		"/slate.m3u8?title=Wrong+IP",
		"https://example.com/SLATE.M3U8?title=provider+error",
	} {
		if !isCometErrorSlate(location) {
			t.Fatalf("expected %q to be detected as an error slate", location)
		}
	}
	if isCometErrorSlate("https://storage.example.com/video.mkv") {
		t.Fatal("media URL was incorrectly detected as an error slate")
	}
}
