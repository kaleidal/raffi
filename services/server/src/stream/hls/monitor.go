package hls

import (
	"context"
	"fmt"
	"path/filepath"
	"time"
)

const (
	bufferMonitorInterval     = 100 * time.Millisecond
	clientDemandResumeGrace   = 4 * time.Second
	playlistDemandResumeGrace = 1200 * time.Millisecond
	playlistDemandNudgeMinGap = 2 * time.Second
)

func bufferedAheadDuration(mediaSeq, segCount, lastServedSeq int) time.Duration {
	if segCount <= 0 {
		return 0
	}
	highest := mediaSeq + segCount - 1
	aheadSegments := max(highest-lastServedSeq, 0)
	return time.Duration(aheadSegments) * DefaultSegmentDuration
}

func (c *Controller) monitorBuffer(id string, ctx context.Context) {
	ticker := time.NewTicker(bufferMonitorInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			c.mu.Lock()
			sess := c.sessions[id]
			if sess == nil || sess.Cmd == nil {
				c.mu.Unlock()
				return
			}
			c.adjustThrottleLocked(sess)
			c.mu.Unlock()
		}
	}
}

func (c *Controller) adjustThrottleLocked(sess *Session) {
	mediaSeq, segCount, err := readPlaylistState(filepath.Join(sess.WorkDir, fmt.Sprintf("slice_%03d", sess.SliceIndex), "child.m3u8"))
	if err != nil || segCount == 0 {
		if !sess.DemandResumeUntil.IsZero() && time.Now().Before(sess.DemandResumeUntil) {
			if sess.Paused && sess.PausedByCap {
				sess.PausedByCap = false
				resumeProcessPlatform(sess, c, sess.ID, sess.Source)
			}
		}
		return
	}

	aheadDuration := bufferedAheadDuration(mediaSeq, segCount, sess.LastServedSeq)
	bufferLimit := sess.BufferAheadLimit
	if bufferLimit <= 0 {
		bufferLimit = MaxBufferAhead
	}
	resumeAhead := max(bufferLimit-2*DefaultSegmentDuration, 0)
	now := time.Now()
	hasDemand := !sess.DemandResumeUntil.IsZero() && now.Before(sess.DemandResumeUntil)

	if aheadDuration >= bufferLimit {
		if !sess.Paused {
			sess.PausedByCap = true
			pauseProcess(sess)
		}
		return
	}

	if hasDemand || aheadDuration <= resumeAhead {
		if sess.Paused && sess.PausedByCap {
			sess.PausedByCap = false
			resumeProcessPlatform(sess, c, sess.ID, sess.Source)
		}
	}
}

func (c *Controller) MarkSegmentServed(id, filename string) {
	seq, ok := parseSegmentSequence(filename)
	if !ok {
		return
	}

	c.mu.Lock()
	sess := c.sessions[id]
	if sess == nil {
		c.mu.Unlock()
		return
	}
	if seq > sess.LastServedSeq {
		sess.LastServedSeq = seq
	}
	c.adjustThrottleLocked(sess)
	c.mu.Unlock()
}

func (c *Controller) NotifyClientAssetRequest(id string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	sess := c.sessions[id]
	if sess == nil {
		return
	}

	sess.DemandResumeUntil = time.Now().Add(clientDemandResumeGrace)

	// If throttling paused ffmpeg and a client is actively requesting assets,
	// resume immediately so waitForFile can make progress.
	if sess.Paused && sess.PausedByCap {
		sess.PausedByCap = false
		resumeProcessPlatform(sess, c, id, sess.Source)
	}

	// Re-evaluate cap state after the resume signal.
	c.adjustThrottleLocked(sess)
}

func (c *Controller) NotifyClientPlaylistRequest(id string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	sess := c.sessions[id]
	if sess == nil {
		return
	}

	// Polling an already usable playlist is not demand for more media. Without
	// this guard, normal HLS polling continuously wakes a saturated transcoder.
	manifestPath := filepath.Join(sess.WorkDir, fmt.Sprintf("slice_%03d", sess.SliceIndex), "child.m3u8")
	if _, segCount, err := readPlaylistState(manifestPath); err == nil && segCount > 0 {
		return
	}

	now := time.Now()
	if !sess.LastPlaylistNudge.IsZero() && now.Sub(sess.LastPlaylistNudge) < playlistDemandNudgeMinGap {
		return
	}
	sess.LastPlaylistNudge = now

	resumeUntil := now.Add(playlistDemandResumeGrace)
	if resumeUntil.After(sess.DemandResumeUntil) {
		sess.DemandResumeUntil = resumeUntil
	}

	if sess.Paused && sess.PausedByCap {
		sess.PausedByCap = false
		resumeProcessPlatform(sess, c, id, sess.Source)
	}

	c.adjustThrottleLocked(sess)
}
