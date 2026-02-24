package hls

import (
	"context"
	"log"
	"os"
	"os/exec"
	"path/filepath"
)

func (c *Controller) StopSession(id string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	sess := c.sessions[id]
	if sess == nil {
		return nil
	}

	if sess.Cmd != nil && sess.Cmd.Process != nil {
		if sess.CmdCancel != nil {
			sess.CmdCancel()
		}
		_ = sess.Cmd.Process.Kill()
	}

	if sess.WorkDir != "" {
		_ = os.RemoveAll(sess.WorkDir)
	}

	delete(c.sessions, id)
	return nil
}

func (c *Controller) CleanupOrphanedSessions() {
	// Get list of all temp directories
	raffiTempDir := filepath.Join(os.TempDir(), "raffi")
	entries, err := os.ReadDir(raffiTempDir)
	if err != nil {
		if !os.IsNotExist(err) {
			log.Printf("Failed to read temp directory: %v", err)
		}
		return
	}

	raffiTorrentsTempDir := filepath.Join(os.TempDir(), "raffi-torrents")
	torrents, err := os.ReadDir(raffiTorrentsTempDir)
	if err != nil {
		if !os.IsNotExist(err) {
			log.Printf("Failed to read temp directory: %v", err)
		}
		return
	}

	// Get active session IDs
	c.mu.Lock()
	activeIDs := make(map[string]bool)
	for id := range c.sessions {
		activeIDs[id] = true
	}
	c.mu.Unlock()

	// Remove directories for non-active sessions
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		sessionID := entry.Name()
		if !activeIDs[sessionID] {
			dirPath := filepath.Join(raffiTempDir, sessionID)
			log.Printf("Removing orphaned session directory: %s", sessionID)
			if err := os.RemoveAll(dirPath); err != nil {
				log.Printf("Failed to remove orphaned directory %s: %v", dirPath, err)
			}
		}
	}

	for _, entry := range torrents {
		if !entry.IsDir() {
			continue
		}
		torrentID := entry.Name()
		if !activeIDs[torrentID] {
			dirPath := filepath.Join(raffiTorrentsTempDir, torrentID)
			log.Printf("Removing orphaned torrent directory: %s", torrentID)
			if err := os.RemoveAll(dirPath); err != nil {
				log.Printf("Failed to remove orphaned directory %s: %v", dirPath, err)
			}
		}
	}
}

func (c *Controller) ensureCmdLocked(
	id, source string,
	sess *Session,
	seek float64,
	outDir string,
	append bool,
) error {
	if sess.Cmd != nil {
		sess.CmdCancel()
		sess.CmdCancel = nil
		sess.Cmd = nil
	}

	ctxCmd, cancel := context.WithCancel(context.Background())
	sess.CmdCancel = cancel

	cmd, err := c.startCmd(ctxCmd, source, outDir, seek, sess.SliceIndex, DefaultSegmentDuration, MaxBufferAhead, sess.Codec, sess.AudioIndex, sess.AudioCodec, append)
	if err != nil {
		cancel()
		return err
	}

	sess.Cmd = cmd
	sess.CmdCancel = cancel
	sess.CurrentlyAt = seek
	sess.Paused = false
	sess.PausedByCap = false
	sess.LastServedSeq = -1
	sess.Finished = false

	go func(sessionID string, command *exec.Cmd, cmdCtx context.Context) {
		err := command.Wait()
		cancel()
		c.cleanupProcess(sessionID, command, err)
	}(id, cmd, ctxCmd)

	go c.monitorBuffer(id, ctxCmd)

	return nil
}

func (c *Controller) cleanupProcess(id string, cmd *exec.Cmd, err error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	sess := c.sessions[id]
	if sess == nil {
		return
	}

	// if the session has moved on to a new command, don't touch it
	if sess.Cmd != cmd {
		return
	}

	if err == nil {
		sess.Finished = true
	} else {
		log.Printf("ffmpeg exited with error for session %s: %v", id, err)
	}
	sess.Cmd = nil
	sess.CmdCancel = nil
	sess.Paused = false
}
