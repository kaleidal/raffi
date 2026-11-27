import { formatAudioTrackDetail, formatAudioTrackLabel, type ProbedStream } from "../../../lib/media";
import { audioTracks } from "../playerState";
import type { Track } from "../types";

export function sessionFromProbe(meta: ProbedStream | null, src: string) {
	const availableStreams =
		meta?.audioTracks.map((track) => ({
			type: "audio",
			index: track.index,
			title: formatAudioTrackLabel(track),
			detail: formatAudioTrackDetail(track),
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
		label: stream.title,
		detail: stream.detail,
		selected: stream.index === audioIndex,
		group: "Embedded",
	}));

	if (nextAudioTracks.length === 0) return data;

	audioTracks.set(nextAudioTracks);

	return {
		...data,
		...probed,
		audioIndex,
		availableStreams: streams,
	};
}

export function embeddedSubtitleTracks(meta: ProbedStream | null, src: string): Track[] {
	return (meta?.subtitleTracks ?? []).map((track) => {
		return {
			id: `embedded:${track.number}`,
			label: track.name || formatAudioTrackLabel(track),
			detail: track.isForced ? "Built in · Forced" : "Built in",
			selected: false,
			group: "Embedded",
			lang: track.language ?? "und",
			url: src,
			isEmbedded: true,
			embeddedTrack: track.number,
		};
	});
}
