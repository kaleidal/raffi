package hls

import (
	"context"
	"fmt"
	"path/filepath"
	"time"
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
	mediaSeq, segCount, err := readPlaylistState(filepath.Join(sess.WorkDir, fmt.Sprintf("slice_%03d", sess.SliceIndex), "child.m3u8"))
	if err != nil || segCount == 0 {
		return
	}

	highest := mediaSeq + segCount - 1
	aheadSegments := highest - sess.LastServedSeq
	if aheadSegments < 0 {
		aheadSegments = 0
	}
	aheadDuration := time.Duration(aheadSegments) * DefaultSegmentDuration

	switch {
	case aheadDuration >= MaxBufferAhead && !sess.Paused:
		pauseProcess(sess)
	case aheadDuration <= MaxBufferAhead/2 && sess.Paused:
		resumeProcessPlatform(sess, c, sess.ID, sess.Source)
	}
}

func (c *Controller) adjustThrottleInMonitor(id string, sess *Session) {
	mediaSeq, segCount, err := readPlaylistState(filepath.Join(sess.WorkDir, fmt.Sprintf("slice_%03d", sess.SliceIndex), "child.m3u8"))
	if err != nil || segCount == 0 {
		return
	}

	highest := mediaSeq + segCount - 1
	aheadSegments := highest - sess.LastServedSeq
	if aheadSegments < 0 {
		aheadSegments = 0
	}
	aheadDuration := time.Duration(aheadSegments) * DefaultSegmentDuration

	switch {
	case aheadDuration >= MaxBufferAhead && !sess.Paused:
		pauseProcess(sess)
	case aheadDuration <= MaxBufferAhead/2 && sess.Paused:
		resumeProcessPlatform(sess, c, id, sess.Source)
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
