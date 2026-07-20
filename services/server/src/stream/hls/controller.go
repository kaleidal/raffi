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
	PrefetchBufferAhead    = 12 * time.Second
)

type Controller struct {
	mu           sync.Mutex
	sessions     map[string]*Session
	probeCache   map[string]probeCacheEntry
	bufferLimits map[string]time.Duration
	ffprobeFn    func(ctx context.Context, source string) (*Metadata, string, error)
	startCmd     TranscoderFunc
}

type probeCacheEntry struct {
	meta  *Metadata
	codec string
}

func NewController(ffmpegPath, ffprobePath string) *Controller {
	return &Controller{
		sessions:     make(map[string]*Session),
		probeCache:   make(map[string]probeCacheEntry),
		bufferLimits: make(map[string]time.Duration),
		ffprobeFn:    NewProbeDuration(ffprobePath),
		startCmd:     NewTranscoder(ffmpegPath),
	}
}

func (c *Controller) getOrProbeLocked(ctx context.Context, source string) (*Metadata, string, string, error) {
	if cached, ok := c.probeCache[source]; ok {
		resolvedSource, err := ResolvePlaybackSource(ctx, source)
		if err != nil {
			return nil, "", "", err
		}
		return cached.meta, cached.codec, resolvedSource, nil
	}

	resolvedSource, err := ResolvePlaybackSource(ctx, source)
	if err != nil {
		return nil, "", "", err
	}
	meta, codec, err := c.ffprobeFn(ctx, resolvedSource)
	if err != nil {
		return nil, "", "", err
	}

	c.probeCache[source] = probeCacheEntry{meta: meta, codec: codec}
	return meta, codec, resolvedSource, nil
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

		meta, codec, resolvedSource, err := c.getOrProbeLocked(ctx, source)
		if err != nil {
			c.mu.Unlock()
			return 0, "", fmt.Errorf("probe failed: %w", err)
		}
		duration := meta.Format.DurationSeconds

		streams, audioIndex := StreamsFromMetadata(meta)
		audioCodec := AudioCodecForIndex(meta, audioIndex)

		sess = &Session{
			ID:               id,
			Source:           resolvedSource,
			WorkDir:          baseDir,
			DurationHint:     duration,
			Codec:            codec,
			AudioIndex:       audioIndex,
			AudioCodec:       audioCodec,
			AvailableStreams: streams,
			BufferAheadLimit: c.bufferAheadLimitLocked(id),
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
		duration := sess.DurationHint
		active := sess.Cmd != nil && sess.Cmd.Process != nil
		abortFn := c.transcoderAbortFn(id)
		c.mu.Unlock()
		if active {
			if err := waitForManifestReady(ctx, manifestPath, abortFn); err != nil {
				return 0, "", err
			}
		}
		return duration, manifestPath, nil
	}

	sliceDir := filepath.Join(sess.WorkDir, fmt.Sprintf("slice_%03d", sess.SliceIndex))
	if err := os.MkdirAll(sliceDir, 0o755); err != nil {
		c.mu.Unlock()
		return 0, "", err
	}

	resumeAt := sess.Slices[sess.SliceIndex].StartTime
	startSequence := sess.SliceIndex
	appendMode := false
	manifestPath := filepath.Join(sliceDir, "child.m3u8")
	if resumeTime, nextSequence, ok := playlistResumePoint(manifestPath, resumeAt); ok {
		resumeAt = resumeTime
		startSequence = nextSequence
		appendMode = true
		log.Printf("Resuming interrupted HLS session %s at %.2fs (sequence %d)", id, resumeAt, startSequence)
	}

	if err := c.ensureCmdLocked(id, sess.Source, sess, resumeAt, startSequence, sliceDir, appendMode, len(sess.AvailableStreams) > 0); err != nil {
		c.mu.Unlock()
		return 0, "", err
	}

	duration := sess.DurationHint
	abortFn := c.transcoderAbortFn(id)
	c.mu.Unlock()

	if err := waitForManifestReady(ctx, manifestPath, abortFn); err != nil {
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

		meta, codec, resolvedSource, err := c.getOrProbeLocked(ctx, source)
		if err != nil {
			c.mu.Unlock()
			return 0, 0, "", fmt.Errorf("probe failed: %w", err)
		}
		duration := meta.Format.DurationSeconds

		streams, audioIndex := StreamsFromMetadata(meta)
		audioCodec := AudioCodecForIndex(meta, audioIndex)

		sess = &Session{
			ID:               id,
			Source:           resolvedSource,
			WorkDir:          baseDir,
			DurationHint:     duration,
			Codec:            codec,
			AudioIndex:       audioIndex,
			AudioCodec:       audioCodec,
			AvailableStreams: streams,
			BufferAheadLimit: c.bufferAheadLimitLocked(id),
			LastServedSeq:    -1,
			SliceIndex:       0,
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

		if err := c.ensureCmdLocked(id, sess.Source, sess, target, sess.SliceIndex, sliceDir, false, len(sess.AvailableStreams) > 0); err != nil {
			c.mu.Unlock()
			return 0, 0, "", err
		}

		manifestPath := filepath.Join(sliceDir, "child.m3u8")
		abortFn := c.transcoderAbortFn(id)
		c.mu.Unlock()

		if err := waitForManifestSegments(ctx, manifestPath, abortFn, 1); err != nil {
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

		duration := sess.DurationHint
		active := sess.Cmd != nil && sess.Cmd.Process != nil
		abortFn := c.transcoderAbortFn(id)
		c.mu.Unlock()
		if active {
			if err := waitForManifestSegments(ctx, manifestPath, abortFn, 1); err != nil {
				return 0, 0, "", err
			}
		}
		return duration, startTime, manifestPath, nil
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
			mediaSeq, timeline, err := readPlaylistTimeline(manifestPath, slice.StartTime)
			if err != nil || len(timeline) == 0 {
				continue
			}

			lastSegment := timeline[len(timeline)-1]
			endTime := lastSegment.End
			if target < slice.StartTime || target >= endTime {
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

			if sess.Cmd == nil && !sess.Finished && endTime < sess.DurationHint {
				resumeTime := endTime
				nextSequence := mediaSeq + len(timeline)
				if err := c.ensureCmdLocked(id, sess.Source, sess, resumeTime, nextSequence, sliceDir, true, len(sess.AvailableStreams) > 0); err != nil {
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

	if err := c.ensureCmdLocked(id, sess.Source, sess, target, sess.SliceIndex, sliceDir, false, len(sess.AvailableStreams) > 0); err != nil {
		c.mu.Unlock()
		return 0, 0, "", err
	}

	duration := sess.DurationHint
	manifestPath := filepath.Join(sliceDir, "child.m3u8")
	abortFn := c.transcoderAbortFn(id)
	c.mu.Unlock()

	if err := waitForManifestSegments(ctx, manifestPath, abortFn, 1); err != nil {
		return 0, 0, "", err
	}

	return duration, target, manifestPath, nil
}

// transcoderAbortFn returns a callback suitable for waitForManifestReady that
// reports true once the ffmpeg process for the given session has exited.
// It snapshots the live state under the controller lock so concurrent
// cleanupProcess calls are observed immediately.
func (c *Controller) transcoderAbortFn(id string) func() bool {
	return func() bool {
		c.mu.Lock()
		defer c.mu.Unlock()
		sess := c.sessions[id]
		if sess == nil {
			return true
		}
		return sess.Cmd == nil
	}
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

func (c *Controller) SetBufferAheadLimit(id string, limit time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if limit <= 0 || limit >= MaxBufferAhead {
		delete(c.bufferLimits, id)
		limit = MaxBufferAhead
	} else {
		c.bufferLimits[id] = limit
	}
	if sess := c.sessions[id]; sess != nil {
		sess.BufferAheadLimit = limit
		c.adjustThrottleLocked(sess)
	}
}

func (c *Controller) bufferAheadLimitLocked(id string) time.Duration {
	if limit := c.bufferLimits[id]; limit > 0 {
		return limit
	}
	return MaxBufferAhead
}

func (c *Controller) IsProducing(id string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	sess := c.sessions[id]
	return sess != nil && sess.Cmd != nil && !sess.Finished
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
