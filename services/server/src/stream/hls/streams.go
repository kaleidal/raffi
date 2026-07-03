package hls

import (
	"raffi-server/src/session"
	"strings"
)

func IsTextSubtitleCodec(codec string) bool {
	switch strings.ToLower(codec) {
	case "subrip", "srt", "ass", "ssa", "webvtt", "mov_text", "text":
		return true
	default:
		return false
	}
}

func StreamsFromMetadata(meta *Metadata) ([]session.StreamInfo, int) {
	if meta == nil {
		return nil, 0
	}

	var streams []session.StreamInfo
	audioIndex := 0
	audioCount := 0
	subtitleCount := 0
	foundEng := false

	for _, st := range meta.Streams {
		switch st.CodecType {
		case "audio":
			streams = append(streams, session.StreamInfo{
				Index:    audioCount,
				Type:     "audio",
				Codec:    st.CodecName,
				Language: st.Tags.Language,
				Title:    st.Tags.Title,
			})
			if strings.EqualFold(st.Tags.Language, "eng") && !foundEng {
				audioIndex = audioCount
				foundEng = true
			}
			audioCount++
		case "subtitle":
			if !IsTextSubtitleCodec(st.CodecName) {
				continue
			}
			streams = append(streams, session.StreamInfo{
				Index:    subtitleCount,
				Type:     "subtitle",
				Codec:    st.CodecName,
				Language: st.Tags.Language,
				Title:    st.Tags.Title,
			})
			subtitleCount++
		}
	}

	return streams, audioIndex
}

func AudioCodecForIndex(meta *Metadata, audioIndex int) string {
	if meta == nil {
		return "aac"
	}

	currentAudioIdx := 0
	for _, st := range meta.Streams {
		if st.CodecType != "audio" {
			continue
		}
		if currentAudioIdx == audioIndex {
			if st.CodecName != "" {
				return st.CodecName
			}
			break
		}
		currentAudioIdx++
	}

	return "aac"
}
