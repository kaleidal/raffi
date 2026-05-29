package hls

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"
)

type Metadata struct {
	Format struct {
		Duration        string  `json:"duration"`
		DurationSeconds float64 `json:"-"`
	} `json:"format"`
	Streams []struct {
		Index     int    `json:"index"`
		CodecName string `json:"codec_name"`
		CodecType string `json:"codec_type"`
		PixFmt    string `json:"pix_fmt"`
		Profile   string `json:"profile"`
		Tags      struct {
			Language string `json:"language"`
			Title    string `json:"title"`
		} `json:"tags"`
	} `json:"streams"`
	Chapters []struct {
		ID        int64   `json:"id"`
		TimeBase  string  `json:"time_base"`
		Start     int64   `json:"start"`
		StartTime float64 `json:"start_time,string"`
		End       int64   `json:"end"`
		EndTime   float64 `json:"end_time,string"`
		Tags      struct {
			Title string `json:"title"`
		} `json:"tags"`
	} `json:"chapters"`
}

type StreamInfo struct {
	Index    int    `json:"index"`
	Type     string `json:"type"` // "audio" or "subtitle"
	Codec    string `json:"codec"`
	Language string `json:"language"`
	Title    string `json:"title"`
}

func ProbeDuration(ctx context.Context, source string) (*Metadata, string, error) {
	return NewProbeDuration("ffprobe")(ctx, source)
}

func NewProbeDuration(ffprobePath string) func(ctx context.Context, source string) (*Metadata, string, error) {
	// On Linux we keep a fallback candidate (system ffprobe) in case the
	// bundled static build segfaults on certain debrid resolver URLs.
	var fallbackOnce sync.Once
	var fallbackPath string

	return func(ctx context.Context, source string) (*Metadata, string, error) {
		probeSource := source
		if strings.Contains(source, "/torrents/") {
			if strings.Contains(source, "?") {
				probeSource = source + "&metadata=1"
			} else {
				probeSource = source + "?metadata=1"
			}
		}

		attemptPaths := []string{ffprobePath}
		if runtime.GOOS == "linux" {
			fallbackOnce.Do(func() {
				if p, _ := exec.LookPath("ffprobe"); p != "" && p != ffprobePath {
					fallbackPath = p
					log.Printf("ffprobe fallback available: %s (will be used if bundled binary crashes)", fallbackPath)
				}
			})
			if fallbackPath != "" {
				attemptPaths = append(attemptPaths, fallbackPath)
			}
		}

		var lastErr error
		for _, p := range attemptPaths {
			cmd := exec.CommandContext(ctx, p,
				"-v", "quiet",
				"-analyzeduration", "1000000",
				"-probesize", "1000000",
				"-print_format", "json",
				"-show_format",
				"-show_streams",
				"-show_chapters",
				probeSource,
			)
			out, err := cmd.Output()
			if err == nil {
				// Success — if we used fallback, remember it for future calls
				if p != ffprobePath && fallbackPath != "" {
					ffprobePath = p // switch primary for this process
				}
				var data Metadata
				if uerr := json.Unmarshal(out, &data); uerr != nil {
					return nil, "", uerr
				}
				dur, _ := strconv.ParseFloat(data.Format.Duration, 64)
				data.Format.DurationSeconds = dur

				videoCodec := "libx264"
				for _, st := range data.Streams {
					if st.CodecType != "video" {
						continue
					}
					if st.CodecName == "h264" && st.Profile != "High 10" && st.Profile != "High 4:2:2" && st.Profile != "High 4:4:4 Predictive" {
						videoCodec = "h264"
					}
					break
				}
				return &data, videoCodec, nil
			}

			lastErr = wrapProbeError(p, err)

			// If this was a hard crash (segfault etc.) on the primary Linux binary,
			// try the fallback on the next iteration of the loop.
			if p == ffprobePath && strings.Contains(lastErr.Error(), "signal") && runtime.GOOS == "linux" {
				log.Printf("primary ffprobe crashed (%v), will try fallback on next attempt", lastErr)
				continue
			}
			// For non-crash errors or non-Linux, stop after first failure
			break
		}

		return nil, "", lastErr
	}
}

func (c *Controller) ProbeMetadata(ctx context.Context, id, source string) (*Metadata, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	meta, _, err := c.getOrProbeLocked(ctx, source)
	return meta, err
}

// wrapProbeError turns exec errors from ffprobe into clearer messages,
// especially when the binary itself crashed (e.g. segfault from a bad static build).
func wrapProbeError(ffprobePath string, err error) error {
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		if ws, ok := exitErr.Sys().(syscall.WaitStatus); ok && ws.Signaled() {
			sig := ws.Signal()
			return fmt.Errorf("ffprobe binary crashed (signal %s) at %s: %w", sig, ffprobePath, err)
		}
		return fmt.Errorf("ffprobe exited with error (code %d) at %s: %w", exitErr.ExitCode(), ffprobePath, err)
	}
	// Other errors (context deadline, binary not found, etc.)
	return fmt.Errorf("ffprobe failed at %s: %w", ffprobePath, err)
}
