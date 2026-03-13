package hls

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"raffi-server/src/session"
)

const (
	DefaultSegmentDuration = 6 * time.Second
	MaxBufferAhead         = 90 * time.Second
	sliceReuseSafetyMargin = 5.0
)

type Controller struct {
	mu         sync.Mutex
	sessions   map[string]*Session
	probeCache map[string]probeCacheEntry
	ffprobeFn  func(ctx context.Context, source string) (*Metadata, string, error)
	startCmd   TranscoderFunc
}

type probeCacheEntry struct {
	meta  *Metadata
	codec string
}

func NewController(ffmpegPath, ffprobePath string) *Controller {
	return &Controller{
		sessions:   make(map[string]*Session),
		probeCache: make(map[string]probeCacheEntry),
		ffprobeFn:  NewProbeDuration(ffprobePath),
		startCmd:   NewTranscoder(ffmpegPath),
	}
}

func (c *Controller) getOrProbeLocked(ctx context.Context, source string) (*Metadata, string, error) {
	if cached, ok := c.probeCache[source]; ok {
		return cached.meta, cached.codec, nil
	}

	meta, codec, err := c.ffprobeFn(ctx, source)
	if err != nil {
		return nil, "", err
	}

	c.probeCache[source] = probeCacheEntry{meta: meta, codec: codec}
	return meta, codec, nil
}

func isTorrentSource(source string) bool {
	// Raffi torrent sessions use a local HTTP source like:
	// http://127.0.0.1:6969/torrents/{infoHash}
	return strings.Contains(source, "/torrents/")
}

func (c *Controller) EnsureSession(ctx context.Context, id, source string, startTime float64) (float64, string, error) {
	c.mu.Lock()
	sess := c.sessions[id]
	if sess == nil {
		baseDir := session.TempDirForSession(id)
		if err := os.MkdirAll(baseDir, 0o755); err != nil {
			c.mu.Unlock()
			return 0, "", err
		}

		probeCtx := ctx
		if isTorrentSource(source) {
			ctxProbe, cancel := context.WithTimeout(ctx, 10*time.Second)
			defer cancel()
			probeCtx = ctxProbe
		}

		meta, codec, err := c.getOrProbeLocked(probeCtx, source)
		if err != nil {
			c.mu.Unlock()
			return 0, "", err
		}
		duration := meta.Format.DurationSeconds

		var streams []session.StreamInfo
		audioIndex := 0
		audioCount := 0
		foundEng := false

		for _, st := range meta.Streams {
			if st.CodecType == "audio" {
				streams = append(streams, session.StreamInfo{
					Index:    audioCount, // This is the index relative to audio streams for ffmpeg map
					Type:     "audio",
					Codec:    st.CodecName,
					Language: st.Tags.Language,
					Title:    st.Tags.Title,
				})

				if st.Tags.Language == "eng" && !foundEng {
					audioIndex = audioCount
					foundEng = true
				}
				audioCount++
			}
		}

		// Find codec for selected audio index
		audioCodec := "aac" // Default
		currentAudioIdx := 0
		for _, st := range meta.Streams {
			if st.CodecType == "audio" {
				if currentAudioIdx == audioIndex {
					audioCodec = st.CodecName
					break
				}
				currentAudioIdx++
			}
		}

		sess = &Session{
			ID:               id,
			Source:           source,
			WorkDir:          baseDir,
			DurationHint:     duration,
			Codec:            codec,
			AudioIndex:       audioIndex,
			AudioCodec:       audioCodec,
			AvailableStreams: streams,
			LastServedSeq:    -1,
			SliceIndex:       0,
			Slices: []SliceInfo{
				{Index: 0, StartTime: startTime},
			},
		}
		c.sessions[id] = sess
	}

	sess.LastAccess = time.Now()

	if (sess.Cmd != nil && sess.Cmd.Process != nil) || sess.Finished {
		sliceDir := filepath.Join(sess.WorkDir, fmt.Sprintf("slice_%03d", sess.SliceIndex))
		manifestPath := filepath.Join(sliceDir, "child.m3u8")
		c.mu.Unlock()
		return sess.DurationHint, manifestPath, nil
	}

	sliceDir := filepath.Join(sess.WorkDir, fmt.Sprintf("slice_%03d", sess.SliceIndex))
	if err := os.MkdirAll(sliceDir, 0o755); err != nil {
		c.mu.Unlock()
		return 0, "", err
	}

	if err := c.ensureCmdLocked(id, source, sess, sess.Slices[sess.SliceIndex].StartTime, sliceDir, false); err != nil {
		c.mu.Unlock()
		return 0, "", err
	}

	duration := sess.DurationHint
	manifestPath := filepath.Join(sliceDir, "child.m3u8")
	c.mu.Unlock()

	manifestTimeout := 10 * time.Second
	if isTorrentSource(source) {
		manifestTimeout = 60 * time.Second
	}
	if err := waitForManifestReady(manifestPath, manifestTimeout); err != nil {
		return 0, "", err
	}

	return duration, manifestPath, nil
}

func (c *Controller) Seek(ctx context.Context, id, source string, target float64, seekID string, forceSlice bool) (float64, float64, string, error) {
	c.mu.Lock()
	sess := c.sessions[id]
	if sess == nil {
		log.Printf("Seek: session %s is nil, creating new...", id)
		// ... (rest of the new creation logic)
		// Create session if not exists, starting at target
		baseDir := session.TempDirForSession(id)
		if err := os.MkdirAll(baseDir, 0o755); err != nil {
			c.mu.Unlock()
			return 0, 0, "", err
		}

		probeCtx := ctx
		if isTorrentSource(source) {
			ctxProbe, cancel := context.WithTimeout(ctx, 2*time.Minute)
			defer cancel()
			probeCtx = ctxProbe
		}
		meta, codec, err := c.getOrProbeLocked(probeCtx, source)
		if err != nil {
			c.mu.Unlock()
			return 0, 0, "", err
		}
		duration := meta.Format.DurationSeconds

		audioIndex := 0
		audioCount := 0
		foundEng := false
		for _, st := range meta.Streams {
			if st.CodecType == "audio" {
				if st.Tags.Language == "eng" && !foundEng {
					audioIndex = audioCount
					foundEng = true
				}
				audioCount++
			}
		}

		// Find codec for selected audio index
		audioCodec := "aac" // Default
		currentAudioIdx := 0
		for _, st := range meta.Streams {
			if st.CodecType == "audio" {
				if currentAudioIdx == audioIndex {
					audioCodec = st.CodecName
					break
				}
				currentAudioIdx++
			}
		}

		sess = &Session{
			WorkDir:       baseDir,
			DurationHint:  duration,
			Codec:         codec,
			AudioIndex:    audioIndex,
			AudioCodec:    audioCodec,
			LastServedSeq: -1,
			SliceIndex:    0,
			Slices: []SliceInfo{
				{Index: 0, StartTime: target},
			},
			LastSeekID: seekID,
		}
		c.sessions[id] = sess

		// Initialize the first slice
		sliceDir := filepath.Join(sess.WorkDir, fmt.Sprintf("slice_%03d", sess.SliceIndex))
		if err := os.MkdirAll(sliceDir, 0o755); err != nil {
			c.mu.Unlock()
			return 0, 0, "", err
		}

		if err := c.ensureCmdLocked(id, source, sess, target, sliceDir, false); err != nil {
			c.mu.Unlock()
			return 0, 0, "", err
		}

		manifestPath := filepath.Join(sliceDir, "child.m3u8")
		c.mu.Unlock()

		manifestTimeout := 10 * time.Second
		if isTorrentSource(source) {
			manifestTimeout = 60 * time.Second
		}
		if err := waitForManifestReady(manifestPath, manifestTimeout); err != nil {
			return 0, 0, "", err
		}

		return duration, target, manifestPath, nil
	}

	if seekID != "" && sess.LastSeekID == seekID {
		sliceDir := filepath.Join(sess.WorkDir, fmt.Sprintf("slice_%03d", sess.SliceIndex))
		manifestPath := filepath.Join(sliceDir, "child.m3u8")

		startTime := 0.0
		for _, s := range sess.Slices {
			if s.Index == sess.SliceIndex {
				startTime = s.StartTime
				break
			}
		}

		c.mu.Unlock()
		return sess.DurationHint, startTime, manifestPath, nil
	}

	if target < 0 {
		target = 0
	}
	if sess.DurationHint > 0 && target > sess.DurationHint {
		target = sess.DurationHint
	}

	if !forceSlice {
		// Check if we can reuse an existing slice
		for _, slice := range sess.Slices {
			sliceDir := filepath.Join(sess.WorkDir, fmt.Sprintf("slice_%03d", slice.Index))
			manifestPath := filepath.Join(sliceDir, "child.m3u8")
			_, timeline, err := readPlaylistTimeline(manifestPath, slice.StartTime)
			if err != nil || len(timeline) == 0 {
				continue
			}

			lastSegment := timeline[len(timeline)-1]
			endTime := lastSegment.End
			if target < slice.StartTime || target >= (endTime-sliceReuseSafetyMargin) {
				continue
			}

			hasTargetSegment := false
			for _, seg := range timeline {
				if target >= seg.Start && target < seg.End {
					if _, statErr := os.Stat(filepath.Join(sliceDir, seg.Filename)); statErr == nil {
						hasTargetSegment = true
					}
					break
				}
			}

			if !hasTargetSegment {
				continue
			}

			log.Printf("Seek: reusing cached segment in slice %d (start=%.2f) for target %.2f", slice.Index, slice.StartTime, target)
			sess.SliceIndex = slice.Index
			sess.LastSeekID = seekID
			sess.CurrentlyAt = target

			if !sess.Finished && endTime < sess.DurationHint {
				resumeTime := endTime
				if err := c.ensureCmdLocked(id, source, sess, resumeTime, sliceDir, true); err != nil {
					log.Printf("Failed to resume slice %d: %v", slice.Index, err)
				}
			}

			c.mu.Unlock()
			return sess.DurationHint, slice.StartTime, manifestPath, nil
		}
	}

	sess.LastAccess = time.Now()
	sess.Finished = false
	sess.LastSeekID = seekID

	sess.SliceIndex++
	sess.Slices = append(sess.Slices, SliceInfo{
		Index:     sess.SliceIndex,
		StartTime: target,
	})
	sliceDir := filepath.Join(sess.WorkDir, fmt.Sprintf("slice_%03d", sess.SliceIndex))
	if err := os.MkdirAll(sliceDir, 0o755); err != nil {
		c.mu.Unlock()
		return 0, 0, "", err
	}

	if err := c.ensureCmdLocked(id, source, sess, target, sliceDir, false); err != nil {
		c.mu.Unlock()
		return 0, 0, "", err
	}

	duration := sess.DurationHint
	manifestPath := filepath.Join(sliceDir, "child.m3u8")
	c.mu.Unlock()

	if err := waitForManifestReady(manifestPath, 10*time.Second); err != nil {
		return 0, 0, "", err
	}

	return duration, target, manifestPath, nil
}

func (c *Controller) IsDuplicateSeek(id, seekID string) bool {
	if seekID == "" {
		return false
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	sess := c.sessions[id]
	if sess == nil {
		return false
	}

	return sess.LastSeekID == seekID
}

func (c *Controller) GetSliceStart(id string) float64 {
	c.mu.Lock()
	defer c.mu.Unlock()
	sess := c.sessions[id]
	if sess == nil {
		return 0
	}

	for _, s := range sess.Slices {
		if s.Index == sess.SliceIndex {
			return s.StartTime
		}
	}
	return 0
}

func (c *Controller) CurrentSliceDir(id string) string {
	c.mu.Lock()
	defer c.mu.Unlock()
	sess := c.sessions[id]
	if sess == nil {
		return ""
	}
	return filepath.Join(sess.WorkDir, fmt.Sprintf("slice_%03d", sess.SliceIndex))
}

func (c *Controller) GetAllSessionIDs() []string {
	c.mu.Lock()
	defer c.mu.Unlock()
	ids := make([]string, 0, len(c.sessions))
	for id := range c.sessions {
		ids = append(ids, id)
	}
	return ids
}

func (c *Controller) SetAudioTrack(id string, index int) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	sess := c.sessions[id]
	if sess == nil {
		return fmt.Errorf("session not found")
	}

	if sess.AudioIndex == index {
		return nil
	}

	sess.AudioIndex = index

	// Update AudioCodec
	for _, st := range sess.AvailableStreams {
		// AvailableStreams index is the relative audio index
		if st.Index == index {
			sess.AudioCodec = st.Codec
			break
		}
	}

	// Kill current command to force restart with new audio index on next request
	if sess.Cmd != nil && sess.Cmd.Process != nil {
		if sess.CmdCancel != nil {
			sess.CmdCancel()
		}
		_ = sess.Cmd.Process.Kill()
	}
	sess.Cmd = nil
	sess.CmdCancel = nil
	sess.Paused = false

	return nil
}

func (c *Controller) DescribeSession(id string) (int, []session.StreamInfo, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	sess := c.sessions[id]
	if sess == nil {
		return 0, nil, false
	}
	streams := make([]session.StreamInfo, len(sess.AvailableStreams))
	copy(streams, sess.AvailableStreams)
	return sess.AudioIndex, streams, true
}
