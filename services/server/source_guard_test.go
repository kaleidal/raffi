package main

import (
	"testing"

	"raffi-server/src/session"
)

func TestValidateSessionSource(t *testing.T) {
	cases := []struct {
		name    string
		source  string
		kind    session.SessionKind
		wantErr bool
	}{
		{name: "https ok", source: "https://cdn.example.com/a.mkv", kind: session.SessionKindHTTP, wantErr: false},
		{name: "magnet ok", source: "magnet:?xt=urn:btih:abc", kind: session.SessionKindTorrent, wantErr: false},
		{name: "file blocked", source: "file:///etc/passwd", kind: session.SessionKindHTTP, wantErr: true},
		{name: "metadata ip", source: "http://169.254.169.254/latest/meta-data", kind: session.SessionKindHTTP, wantErr: true},
		{name: "link local", source: "http://169.254.1.1/x", kind: session.SessionKindHTTP, wantErr: true},
		{name: "local path", source: `C:\Videos\movie.mkv`, kind: session.SessionKindHTTP, wantErr: false},
		{name: "ftp blocked", source: "ftp://example.com/a", kind: session.SessionKindHTTP, wantErr: true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateSessionSource(tc.source, tc.kind)
			if tc.wantErr && err == nil {
				t.Fatalf("expected error")
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}
