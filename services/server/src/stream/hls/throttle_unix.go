//go:build !windows
// +build !windows

package hls

import (
	"syscall"
)

// resumeProcessPlatform is the platform-specific wrapper for resuming
// On Unix, we ignore the extra params and just send SIGCONT
func resumeProcessPlatform(sess *Session, c *Controller, id, source string) {
	resumeProcess(sess)
}

func pauseProcess(sess *Session) {
	_ = sess.Cmd.Process.Signal(syscall.SIGSTOP)
	sess.Paused = true
}

func resumeProcess(sess *Session) {
	_ = sess.Cmd.Process.Signal(syscall.SIGCONT)
	sess.Paused = false
}
