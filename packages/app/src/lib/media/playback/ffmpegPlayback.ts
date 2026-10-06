import { toClientPlayableUrl } from "../localSource";
import { MsePlayback } from "./mse/msePlayback";
import { pickMseMimeType } from "./mse/msePump";
import type { MseTimeline } from "./mse/mseTimeline";
import { ensureAudioTracks, preferredAudioIndex, type ProbedStream } from "../probe/probe";
import type { PlaybackAttachOptions, PlaybackAttachResult } from "./playbackController";
import { acquireStreamInput } from "../probe/streamInput";

function getBridge() {
	const bridge = window.electronAPI?.ffmpegPlayback;
	if (!bridge) throw new Error("Bundled FFmpeg playback is unavailable");
	return bridge;
}

function enableFfmpegAudio(meta: ProbedStream): ProbedStream {
	const normalized = ensureAudioTracks(meta);
	const audioTracks = normalized.audioTracks.map((track) => ({ ...track, playable: true }));
	return {
		...normalized,
		audioTracks,
		preferredAudioIndex: preferredAudioIndex(audioTracks),
	};
}

export function needsFfmpegAudio(meta: ProbedStream, audioIndex?: number): boolean {
	const selectedIndex = audioIndex ?? meta.preferredAudioIndex;
	const selected = meta.audioTracks.find((track) => track.index === selectedIndex);
	return Boolean(selected && !selected.playable);
}

export function canUseFfmpegPlayback(meta: ProbedStream, audioIndex?: number): boolean {
	if (typeof MediaSource === "undefined") return false;
	if (!window.electronAPI?.ffmpegPlayback || !meta.video?.codecString) return false;
	if (!needsFfmpegAudio(meta, audioIndex)) return false;
	return pickMseMimeType(meta.video.codecString, "opus") !== null;
}

/** Copies video and transcodes audio to Opus with the bundled FFmpeg (desktop only). */
export class FfmpegPlayback extends MsePlayback {
	private source = "";
	private sessionId: string | null = null;

	async attach(
		video: HTMLVideoElement,
		src: string,
		opts?: PlaybackAttachOptions,
	): Promise<PlaybackAttachResult> {
		await this.destroy();
		if (!opts?.meta) throw new Error("FFmpeg playback requires probed stream metadata");
		this.video = video;
		this.prefetching = opts.prefetch ?? false;
		this.source = src;
		const meta = enableFfmpegAudio(opts.meta);
		this.meta = meta;
		const preferred = opts.audioIndex ?? meta.preferredAudioIndex ?? 0;
		this.audioIndex = meta.audioTracks.some((track) => track.index === preferred)
			? preferred
			: (meta.audioTracks[0]?.index ?? 0);

		this.stream = acquireStreamInput(await toClientPlayableUrl(src));
		this.videoTrack = await this.stream.input.getPrimaryVideoTrack().catch((error) => {
			console.warn("Failed to read video keyframes for FFmpeg playback", error);
			return null;
		});
		await this.openTimeline(opts.signal);
		await this.startWindow(Math.max(0, opts.startTime ?? 0), true, opts.signal);
		return { durationSeconds: meta.durationSeconds, meta };
	}

	async setAudioTrack(index: number, time: number) {
		if (!this.meta?.audioTracks.some((track) => track.index === index)) {
			throw new Error(`Audio track ${index} is not available`);
		}
		this.audioIndex = index;
		await this.restartAt(time);
	}

	replaceMeta(meta: ProbedStream) {
		super.replaceMeta(enableFfmpegAudio(meta));
	}

	protected async mimeType() {
		const mime = this.meta?.video?.codecString
			? pickMseMimeType(this.meta.video.codecString, "opus")
			: null;
		if (!mime) throw new Error("This video codec cannot be copied into an MP4 stream");
		return mime;
	}

	protected async stopFeed() {
		const sessionId = this.sessionId;
		this.sessionId = null;
		if (!sessionId) return;
		try {
			await getBridge().stop(sessionId);
		} catch {}
	}

	protected async startFeed(timeline: MseTimeline, keyframe: number, signal: AbortSignal) {
		const selectedAudio = this.meta?.audioTracks.find((track) => track.index === this.audioIndex);
		const started = await getBridge().start({
			source: this.source,
			startTime: keyframe,
			audioIndex: this.audioIndex,
			audioChannels: selectedAudio?.channels ?? null,
		});
		if (signal.aborted) {
			await getBridge().stop(started.sessionId).catch(() => {});
			throw new DOMException("Aborted", "AbortError");
		}
		this.sessionId = started.sessionId;

		const response = await fetch(started.streamUrl, { signal });
		if (!response.ok || !response.body) {
			throw new Error(`FFmpeg stream failed with ${response.status}`);
		}
		return { done: timeline.pump(response.body, signal, true).then(() => {}) };
	}
}
