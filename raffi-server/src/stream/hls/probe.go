package hls

import (
	"context"
	"encoding/json"
	"os/exec"
	"strconv"
	"time"
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
	cmd := exec.CommandContext(ctx, "ffprobe",
		"-v", "quiet",
		"-print_format", "json",
		"-show_format",
		"-show_streams",
		"-show_chapters",
		source,
	)
	out, err := cmd.Output()
	if err != nil {
		return nil, "", err
	}

	var data Metadata
	if err := json.Unmarshal(out, &data); err != nil {
		return nil, "", err
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

func (c *Controller) ProbeMetadata(ctx context.Context, id, source string) (*Metadata, error) {
	ctxProbe, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	meta, _, err := ProbeDuration(ctxProbe, source)
	return meta, err
}
