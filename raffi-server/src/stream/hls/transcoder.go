package hls

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type TranscoderFunc func(
	ctx context.Context,
	source, outDir string,
	startSeconds float64,
	startSeq int,
	segmentDur, bufferAhead time.Duration,
	codec string,
	audioIndex int,
	audioCodec string,
	appendMode bool,
) (*exec.Cmd, error)

func DefaultTranscoder(
	ctx context.Context,
	source, outDir string,
	startSeconds float64,
	startSeq int,
	segmentDur, bufferAhead time.Duration,
	codec string,
	audioIndex int,
	audioCodec string,
	appendMode bool,
) (*exec.Cmd, error) {
	if !appendMode {
		_ = os.RemoveAll(outDir)
		if err := os.MkdirAll(outDir, 0o755); err != nil {
			return nil, err
		}
	}

	videoCodec := "libx264"
	videoArgs := []string{}

	switch codec {
	case "h264":
		videoCodec = "copy"
	default:
		videoCodec = "libx264"
		videoArgs = append(videoArgs,
			"-preset", "veryfast",
			"-crf", "23",
			"-pix_fmt", "yuv420p",
			"-profile:v", "main",
			"-level:v", "4.1",
		)
	}

	args := []string{
		"-hwaccel", "auto",
	}

	if strings.HasPrefix(source, "http://") || strings.HasPrefix(source, "https://") {
		args = append(args,
			"-reconnect", "1",
			"-reconnect_at_eof", "1",
			"-reconnect_streamed", "1",
			"-reconnect_delay_max", "5",
		)
	}

	if startSeconds > 0 {
		args = append(args, "-ss", fmt.Sprintf("%f", startSeconds))
	}

	args = append(args,
		"-i", source,
		"-map", "0:v:0",
		"-map", fmt.Sprintf("0:a:%d", audioIndex),
		"-c:v", videoCodec,
	)
	if videoCodec == "copy" {
		args = append(args, "-bsf:v", "h264_mp4toannexb")
	}
	args = append(args, videoArgs...)
	hlsFlags := "independent_segments+temp_file"
	if appendMode {
		hlsFlags += "+append_list"
	}

	// Audio transcoding logic
	if audioCodec == "aac" {
		args = append(args, []string{"-c:a", "copy"}...)
	} else {
		args = append(args, []string{
			"-c:a", "aac",
			"-ac", "2",
			"-ar", "48000",
			"-b:a", "160k",
			"-af", "aresample=async=1,pan=stereo|FL=FC+0.30*FL+0.30*BL|FR=FC+0.30*FR+0.30*BR,loudnorm=I=-16:TP=-1.5:LRA=11",
		}...)
	}

	args = append(args,
		"-avoid_negative_ts", "make_zero",
		"-reset_timestamps", "1",
		"-muxdelay", "0",
		"-muxpreload", "0",
		"-max_interleave_delta", "0",
		"-f", "hls",
		"-hls_time", fmt.Sprintf("%.2f", segmentDur.Seconds()),
		"-hls_list_size", "0",
		"-hls_playlist_type", "event",
		"-hls_flags", hlsFlags,
		"-start_number", strconv.Itoa(startSeq),
		"-hls_segment_filename", filepath.Join(outDir, "segment%05d.ts"),
		filepath.Join(outDir, "child.m3u8"),
	)

	cmd := exec.CommandContext(ctx, "ffmpeg", args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		log.Printf("ffmpeg start failed: %v", err)
		return nil, err
	}
	return cmd, nil
}
