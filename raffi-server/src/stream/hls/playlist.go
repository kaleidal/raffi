package hls

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

func readPlaylistState(path string) (int, int, error) {
	f, err := os.Open(path)
	if err != nil {
		return 0, 0, err
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	mediaSeq := 0
	segments := 0
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "#EXT-X-MEDIA-SEQUENCE:") {
			val := strings.TrimPrefix(line, "#EXT-X-MEDIA-SEQUENCE:")
			if seq, err := strconv.Atoi(strings.TrimSpace(val)); err == nil {
				mediaSeq = seq
			}
		}
		if strings.HasPrefix(line, "#EXTINF:") {
			segments++
		}
	}
	if err := scanner.Err(); err != nil {
		return 0, 0, err
	}
	return mediaSeq, segments, nil
}

func waitForManifestReady(manifestPath string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)

	for {
		if _, err := os.Stat(manifestPath); err == nil {
			break
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("timeout waiting for manifest: %s", manifestPath)
		}
		time.Sleep(100 * time.Millisecond)
	}

	// best-effort: wait for at least 2 segments to ensure smooth start
	for {
		_, segCount, err := readPlaylistState(manifestPath)
		if err == nil && segCount >= 2 {
			return nil
		}
		if time.Now().After(deadline) {
			fmt.Printf("warning: manifest %s has few segments yet, continuing\n", manifestPath)
			return nil
		}
		time.Sleep(100 * time.Millisecond)
	}
}

func parseSegmentSequence(name string) (int, bool) {
	name = strings.TrimSuffix(name, filepath.Ext(name))
	for i := len(name) - 1; i >= 0; i-- {
		if name[i] < '0' || name[i] > '9' {
			name = name[i+1:]
			break
		}
	}
	if name == "" {
		return 0, false
	}
	seq, err := strconv.Atoi(name)
	if err != nil {
		return 0, false
	}
	return seq, true
}
