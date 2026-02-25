package hls

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"time"
)

const (
	throttleCycleWindow      = time.Second
	throttleActivePortion    = 600 * time.Millisecond // ~60% active
	throttleMinAheadToEngage = 12 * time.Second
	clientDemandResumeGrace  = 4 * time.Second
)

func (c *Controller) monitorBuffer(id string, ctx context.Context) {
	ticker := time.NewTicker(250 * time.Millisecond)
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
	isHTTPSource := false
	if sess != nil {
		src := sess.Source
		isHTTPSource = strings.HasPrefix(src, "http://") || strings.HasPrefix(src, "https://")
	}

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

	highest := mediaSeq + segCount - 1
	aheadSegments := max(highest-sess.LastServedSeq, 0)
	aheadDuration := time.Duration(aheadSegments) * DefaultSegmentDuration

	if !sess.DemandResumeUntil.IsZero() && time.Now().Before(sess.DemandResumeUntil) {
		if aheadDuration < MaxBufferAhead {
			if sess.Paused && sess.PausedByCap {
				sess.PausedByCap = false
				resumeProcessPlatform(sess, c, sess.ID, sess.Source)
			}
			return
		}
	}

	switch {
	case aheadDuration >= MaxBufferAhead && !sess.Paused:
		if !isHTTPSource {
			sess.PausedByCap = true
			pauseProcess(sess)
		}
	case aheadDuration <= MaxBufferAhead/2 && sess.Paused:
		sess.PausedByCap = false
		resumeProcessPlatform(sess, c, sess.ID, sess.Source)
	}

	if aheadDuration >= MaxBufferAhead {
		// Local files are already fully paused above; only HTTP sources need the
		// duty-cycle approach to keep the remote connection alive.
		if !isHTTPSource {
			return
		}
		now := time.Now()
		phase := time.Duration(now.UnixNano()) % throttleCycleWindow
		allowWork := phase < (20 * time.Millisecond)

		if allowWork {
			if sess.Paused {
				sess.PausedByCap = false
				resumeProcessPlatform(sess, c, sess.ID, sess.Source)
			}
			return
		}

		if !sess.Paused {
			sess.PausedByCap = true
			pauseProcess(sess)
		}
		return
	}

	if aheadDuration <= MaxBufferAhead/2 {
		return
	}

	// First startup buffer should run uncapped for fastest time-to-first-frame.
	// We only cap after playback has started serving at least one segment.
	if sess.LastServedSeq < 0 {
		if sess.Paused && sess.PausedByCap {
			sess.PausedByCap = false
			resumeProcessPlatform(sess, c, sess.ID, sess.Source)
		}
		return
	}

	// Don't cap when the ahead buffer is still shallow to avoid rebuffer risk.
	if aheadDuration < throttleMinAheadToEngage {
		if sess.Paused && sess.PausedByCap {
			sess.PausedByCap = false
			resumeProcessPlatform(sess, c, sess.ID, sess.Source)
		}
		return
	}

	now := time.Now()
	phase := time.Duration(now.UnixNano()) % throttleCycleWindow
	allowWork := phase < throttleActivePortion

	if allowWork {
		if sess.Paused && sess.PausedByCap {
			sess.PausedByCap = false
			resumeProcessPlatform(sess, c, sess.ID, sess.Source)
		}
		return
	}

	if !sess.Paused {
		sess.PausedByCap = true
		pauseProcess(sess)
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
