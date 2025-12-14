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
	case "hevc":
		videoCodec = "copy"
		videoArgs = append(videoArgs, "-tag:v", "hvc1")
	case "libx264":
		videoCodec = "libx264"
		videoArgs = append(videoArgs, "-preset", "ultrafast")
	default:
		videoCodec = "libx264"
		videoArgs = append(videoArgs, "-preset", "ultrafast")
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
			"-af", "aresample=async=1",
		}...)
	}

	args = append(args,
		"-avoid_negative_ts", "make_zero",
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
