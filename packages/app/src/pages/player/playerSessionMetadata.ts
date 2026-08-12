import { formatAudioTrackLabel, type ProbedStream } from "../../lib/media";
import { audioTracks, currentAudioLabel } from "./playerState";
import type { Track } from "./types";

export function sessionFromProbe(meta: ProbedStream | null, src: string) {
	const availableStreams =
		meta?.audioTracks.map((track) => ({
			type: "audio",
			index: track.index,
			title: formatAudioTrackLabel(track),
			language: track.language || undefined,
			codec: track.codecName || track.codec || undefined,
			playable: track.playable,
		})) ?? [];

	return {
		isDirectHttp: true,
		sourceUrl: src,
		durationSeconds: meta?.durationSeconds ?? 0,
		availableStreams,
		audioIndex: meta?.preferredAudioIndex ?? 0,
		clientPlayback: true,
	};
}

export function applyClientAudioTracks(
	meta: ProbedStream | null,
	src: string,
	data: any,
	selectedIndex?: number,
) {
	const probed = sessionFromProbe(meta, src);
	const streams = probed.availableStreams;
	const audioIndex = selectedIndex ?? data?.audioIndex ?? probed.audioIndex ?? 0;
	const nextAudioTracks: Track[] = streams.map((stream) => ({
		id: stream.index,
		label: stream.title || stream.language || `Audio ${stream.index}`,
		selected: stream.index === audioIndex,
		group: "Embedded",
	}));

	if (nextAudioTracks.length === 0) return data;

	audioTracks.set(nextAudioTracks);
	const selected = nextAudioTracks.find((track) => track.selected);
	if (selected) currentAudioLabel.set(selected.label);

	return {
		...data,
		...probed,
		audioIndex,
		availableStreams: streams,
	};
}
