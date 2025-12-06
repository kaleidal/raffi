package hls

import (
	"context"
	"os/exec"
	"time"

	"raffi-server/src/session"
)

type Session struct {
	ID               string
	Source           string
	WorkDir          string
	LastAccess       time.Time
	CurrentlyAt      float64
	CmdCancel        context.CancelFunc
	Cmd              *exec.Cmd
	DurationHint     float64
	Codec            string
	AudioIndex       int
	AudioCodec       string
	AvailableStreams []session.StreamInfo
	Finished         bool

	LastServedSeq int
	Paused        bool

	SliceIndex int
	LastSeekID string
	Slices     []SliceInfo
}

type SliceInfo struct {
	Index     int
	StartTime float64
}

type Chapter struct {
	StartTime float64 `json:"start_time"`
	EndTime   float64 `json:"end_time"`
	Title     string  `json:"title"`
}
