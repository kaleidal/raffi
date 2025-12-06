//go:build windows
// +build windows

package hls

import (
	"fmt"
	"log"
	"sync"
	"syscall"

	"golang.org/x/sys/windows"
)

var (
	ntdll            = windows.NewLazySystemDLL("ntdll.dll")
	ntSuspendProcess = ntdll.NewProc("NtSuspendProcess")
	ntResumeProcess  = ntdll.NewProc("NtResumeProcess")
	ntProcInitOnce   sync.Once
	ntProcInitErr    error
)

func ensureNtProcedures() error {
	ntProcInitOnce.Do(func() {
		if err := ntSuspendProcess.Find(); err != nil {
			ntProcInitErr = err
			return
		}
		if err := ntResumeProcess.Find(); err != nil {
			ntProcInitErr = err
			return
		}
	})
	return ntProcInitErr
}

func suspendPID(pid int) error {
	if pid <= 0 {
		return fmt.Errorf("invalid pid %d", pid)
	}
	if err := ensureNtProcedures(); err != nil {
		return err
	}
	h, err := windows.OpenProcess(windows.PROCESS_SUSPEND_RESUME|windows.PROCESS_QUERY_INFORMATION, false, uint32(pid))
	if err != nil {
		return err
	}
	defer windows.CloseHandle(h)
	r1, _, callErr := ntSuspendProcess.Call(uintptr(h))
	if r1 != 0 {
		if callErr != nil && callErr != syscall.Errno(0) {
			return callErr
		}
		return fmt.Errorf("NtSuspendProcess failed with status 0x%x", r1)
	}
	return nil
}

func resumePID(pid int) error {
	if pid <= 0 {
		return fmt.Errorf("invalid pid %d", pid)
	}
	if err := ensureNtProcedures(); err != nil {
		return err
	}
	h, err := windows.OpenProcess(windows.PROCESS_SUSPEND_RESUME|windows.PROCESS_QUERY_INFORMATION, false, uint32(pid))
	if err != nil {
		return err
	}
	defer windows.CloseHandle(h)
	r1, _, callErr := ntResumeProcess.Call(uintptr(h))
	if r1 != 0 {
		if callErr != nil && callErr != syscall.Errno(0) {
			return callErr
		}
		return fmt.Errorf("NtResumeProcess failed with status 0x%x", r1)
	}
	return nil
}

func resumeProcessPlatform(sess *Session, c *Controller, id, source string) {
	resumeProcess(sess)
}

func pauseProcess(sess *Session) {
	if sess == nil || sess.Cmd == nil || sess.Cmd.Process == nil || sess.Paused {
		return
	}
	if err := suspendPID(sess.Cmd.Process.Pid); err != nil {
		log.Printf("failed to suspend ffmpeg (pid %d): %v", sess.Cmd.Process.Pid, err)
		return
	}
	sess.Paused = true
}

func resumeProcess(sess *Session) {
	if sess == nil || sess.Cmd == nil || sess.Cmd.Process == nil || !sess.Paused {
		return
	}
	if err := resumePID(sess.Cmd.Process.Pid); err != nil {
		log.Printf("failed to resume ffmpeg (pid %d): %v", sess.Cmd.Process.Pid, err)
		return
	}
	sess.Paused = false
}
