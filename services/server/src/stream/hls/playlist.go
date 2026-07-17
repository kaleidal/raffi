package hls

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type PlaylistSegment struct {
	Sequence int
	Filename string
	Start    float64
	End      float64
}

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

func readPlaylistTimeline(path string, sliceStart float64) (int, []PlaylistSegment, error) {
	f, err := os.Open(path)
	if err != nil {
		return 0, nil, err
	}
	defer f.Close()
	return readPlaylistTimelineFromReader(f, sliceStart)
}

func playlistResumePoint(path string, sliceStart float64) (resumeTime float64, nextSequence int, ok bool) {
	mediaSequence, timeline, err := readPlaylistTimeline(path, sliceStart)
	if err != nil || len(timeline) == 0 {
		return 0, 0, false
	}
	lastSegment := timeline[len(timeline)-1]
	return lastSegment.End, mediaSequence + len(timeline), true
}

func readPlaylistTimelineFromReader(r io.Reader, sliceStart float64) (int, []PlaylistSegment, error) {
	scanner := bufio.NewScanner(r)
	mediaSeq := 0
	nextSeq := 0
	cursor := sliceStart
	pendingDur := 0.0
	segments := make([]PlaylistSegment, 0, 8)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		if strings.HasPrefix(line, "#EXT-X-MEDIA-SEQUENCE:") {
			val := strings.TrimPrefix(line, "#EXT-X-MEDIA-SEQUENCE:")
			if seq, convErr := strconv.Atoi(strings.TrimSpace(val)); convErr == nil {
				mediaSeq = seq
				nextSeq = seq
			}
			continue
		}

		if strings.HasPrefix(line, "#EXTINF:") {
			val := strings.TrimPrefix(line, "#EXTINF:")
			if comma := strings.Index(val, ","); comma >= 0 {
				val = val[:comma]
			}
			dur, convErr := strconv.ParseFloat(strings.TrimSpace(val), 64)
			if convErr != nil || dur <= 0 {
				dur = DefaultSegmentDuration.Seconds()
			}
			pendingDur = dur
			continue
		}

		if strings.HasPrefix(line, "#") {
			continue
		}

		dur := pendingDur
		if dur <= 0 {
			dur = DefaultSegmentDuration.Seconds()
		}
		seg := PlaylistSegment{
			Sequence: nextSeq,
			Filename: line,
			Start:    cursor,
			End:      cursor + dur,
		}
		segments = append(segments, seg)
		cursor = seg.End
		nextSeq++
		pendingDur = 0
	}

	if err := scanner.Err(); err != nil {
		return 0, nil, err
	}

	return mediaSeq, segments, nil
}

func waitForManifestReady(ctx context.Context, manifestPath string, shouldAbort func() bool) error {
	return waitForManifestSegments(ctx, manifestPath, shouldAbort, 1)
}

func waitForManifestSegments(ctx context.Context, manifestPath string, shouldAbort func() bool, minSegments int) error {
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	for {
		if _, err := os.Stat(manifestPath); err == nil {
			_, segCount, readErr := readPlaylistState(manifestPath)
			if readErr == nil && segCount >= minSegments {
				return nil
			}
		}
		if shouldAbort != nil && shouldAbort() {
			return fmt.Errorf("transcoder exited before manifest had usable segments: %s", manifestPath)
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
		}
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
