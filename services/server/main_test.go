package main

import (
	"path/filepath"
	"testing"
)

func TestPathWithinDirectory(t *testing.T) {
	root := t.TempDir()
	inside := filepath.Join(root, "slice_002", "segment00001.ts")
	outside := filepath.Join(root, "..", "other", "segment00001.ts")
	if !pathWithinDirectory(inside, root) {
		t.Fatal("expected slice segment to be accepted")
	}
	if pathWithinDirectory(outside, root) {
		t.Fatal("expected path outside the session directory to be rejected")
	}
}
