package hls

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os/exec"
	"strings"
)

func StreamSubtitle(
	ctx context.Context,
	ffmpegPath, source string,
	subtitleIndex int,
	startSeconds float64,
	w io.Writer,
) error {
	args := []string{
		"-hide_banner",
		"-loglevel", "error",
	}

	if strings.HasPrefix(source, "http://") || strings.HasPrefix(source, "https://") {
		args = append(args,
			"-reconnect", "1",
			"-reconnect_streamed", "1",
			"-reconnect_delay_max", "5",
		)
	}

	args = append(args, "-i", source)

	if startSeconds > 0 {
		args = append(args, "-ss", fmt.Sprintf("%.3f", startSeconds))
	}

	args = append(args,
		"-map", fmt.Sprintf("0:s:%d", subtitleIndex),
		"-c:s", "webvtt",
		"-f", "webvtt",
		"pipe:1",
	)

	cmd := exec.CommandContext(ctx, ffmpegPath, args...)
	cmd.Stdout = w

	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			return fmt.Errorf("ffmpeg subtitle extract failed: %w", err)
		}
		return fmt.Errorf("ffmpeg subtitle extract failed: %w: %s", err, msg)
	}

	return nil
}
