import { pickMseMimeType, pumpStreamToSourceBuffer, TARGET_BUFFER_AHEAD_SECONDS } from "./msePump";
import { ensureAudioTracks, type ProbedStream } from "./probe";

export type ClientPlaybackController = {
	onWindowStartChange: ((globalStart: number) => void) | null;
	attach: (
		video: HTMLVideoElement,
		src: string,
		opts?: {
			startTime?: number;
			signal?: AbortSignal;
			meta?: ProbedStream | null;
			audioIndex?: number;
		},
	) => Promise<{
		durationSeconds: number;
		objectUrl: string;
		meta: ProbedStream;
		remuxOrigin: number;
	}>;
	seek: (globalTime: number) => Promise<number>;
	setAudioTrack: (index: number, globalTime: number) => Promise<number>;
	getRemuxOrigin: () => number;
	getAudioIndex: () => number;
	getMeta: () => ProbedStream | null;
	replaceMeta: (meta: ProbedStream) => void;
	destroy: () => Promise<void>;
};

function getBridge() {
	const bridge = window.electronAPI?.ffmpegPlayback;
	if (!bridge) throw new Error("Bundled FFmpeg playback is unavailable");
	return bridge;
}

function waitForSourceOpen(mediaSource: MediaSource, signal?: AbortSignal) {
	return new Promise<void>((resolve, reject) => {
		const finish = (error?: unknown) => {
			mediaSource.removeEventListener("sourceopen", handleOpen);
			mediaSource.removeEventListener("error", handleError);
			signal?.removeEventListener("abort", handleAbort);
			if (error) reject(error);
			else resolve();
		};
		const handleOpen = () => finish();
		const handleError = () => finish(new Error("MediaSource failed to open"));
		const handleAbort = () => finish(new DOMException("Aborted", "AbortError"));
		mediaSource.addEventListener("sourceopen", handleOpen, { once: true });
		mediaSource.addEventListener("error", handleError, { once: true });
		signal?.addEventListener("abort", handleAbort, { once: true });
		if (signal?.aborted) handleAbort();
	});
}

function waitForInitialBuffer(sourceBuffer: SourceBuffer, signal?: AbortSignal) {
	if (sourceBuffer.buffered.length > 0) return Promise.resolve();
	return new Promise<void>((resolve, reject) => {
		const finish = (error?: unknown) => {
			sourceBuffer.removeEventListener("updateend", check);
			sourceBuffer.removeEventListener("error", handleError);
			signal?.removeEventListener("abort", handleAbort);
			if (error) reject(error);
			else resolve();
		};
		const check = () => {
			if (sourceBuffer.buffered.length > 0) finish();
		};
		const handleError = () => finish(new Error("FFmpeg output could not be buffered"));
		const handleAbort = () => finish(new DOMException("Aborted", "AbortError"));
		sourceBuffer.addEventListener("updateend", check);
		sourceBuffer.addEventListener("error", handleError, { once: true });
		signal?.addEventListener("abort", handleAbort, { once: true });
		if (signal?.aborted) handleAbort();
	});
}

function enableFfmpegAudio(meta: ProbedStream): ProbedStream {
	const normalized = ensureAudioTracks(meta);
	const audioTracks = normalized.audioTracks.map((track) => ({ ...track, playable: true }));
	return { ...normalized, audioTracks };
}

export function canUseFfmpegPlayback(meta: ProbedStream): boolean {
	if (typeof MediaSource === "undefined") return false;
	if (!window.electronAPI?.ffmpegPlayback || !meta.video?.codecString) return false;
	if (meta.audioTracks.length === 0 || meta.audioTracks.every((track) => track.playable)) {
		return false;
	}
	return pickMseMimeType(meta.video.codecString, "mp4a.40.2") !== null;
}

export class FfmpegPlayback implements ClientPlaybackController {
	private video: HTMLVideoElement | null = null;
	private source = "";
	private meta: ProbedStream | null = null;
	private audioIndex = 0;
	private remuxOrigin = 0;
	private sessionId: string | null = null;
	private mediaSource: MediaSource | null = null;
	private objectUrl: string | null = null;
	private abort: AbortController | null = null;
	private generation = 0;
	onWindowStartChange: ((globalStart: number) => void) | null = null;

	async attach(
		video: HTMLVideoElement,
		src: string,
		opts?: {
			startTime?: number;
			signal?: AbortSignal;
			meta?: ProbedStream | null;
			audioIndex?: number;
		},
	) {
		await this.destroy();
		if (!opts?.meta) throw new Error("FFmpeg playback requires probed stream metadata");
		this.video = video;
		this.source = src;
		this.meta = enableFfmpegAudio(opts.meta);
		const preferred = opts.audioIndex ?? this.meta.preferredAudioIndex ?? 0;
		this.audioIndex = this.meta.audioTracks.some((track) => track.index === preferred)
			? preferred
			: (this.meta.audioTracks[0]?.index ?? 0);
		const startTime = Math.max(0, opts.startTime ?? 0);
		await this.startPipeline(startTime, opts.signal);
		return {
			durationSeconds: this.meta.durationSeconds,
			objectUrl: this.objectUrl!,
			meta: this.meta,
			remuxOrigin: this.remuxOrigin,
		};
	}

	async seek(globalTime: number) {
		const duration = this.meta?.durationSeconds || globalTime;
		const clamped = Math.max(0, Math.min(duration, globalTime));
		await this.startPipeline(clamped);
		return this.remuxOrigin;
	}

	async setAudioTrack(index: number, globalTime: number) {
		if (!this.meta?.audioTracks.some((track) => track.index === index)) {
			throw new Error(`Audio track ${index} is not available`);
		}
		this.audioIndex = index;
		return this.seek(globalTime);
	}

	getRemuxOrigin() {
		return this.remuxOrigin;
	}

	getAudioIndex() {
		return this.audioIndex;
	}

	getMeta() {
		return this.meta;
	}

	replaceMeta(meta: ProbedStream) {
		this.meta = enableFfmpegAudio(meta);
	}

	async destroy() {
		this.generation += 1;
		this.abort?.abort();
		this.abort = null;
		await this.stopSession();
		if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
		this.objectUrl = null;
		this.mediaSource = null;
		if (this.video) {
			this.video.pause();
			this.video.removeAttribute("src");
			this.video.load();
		}
		this.video = null;
	}

	private async stopSession() {
		const sessionId = this.sessionId;
		this.sessionId = null;
		if (!sessionId) return;
		try {
			await getBridge().stop(sessionId);
		} catch {}
	}

	private async startPipeline(startTime: number, outerSignal?: AbortSignal) {
		if (!this.video || !this.meta?.video?.codecString || !this.source) {
			throw new Error("FFmpeg playback is not attached");
		}
		const generation = ++this.generation;
		this.video.pause();
		this.abort?.abort();
		await this.stopSession();
		const abort = new AbortController();
		this.abort = abort;
		const handleOuterAbort = () => abort.abort();
		outerSignal?.addEventListener("abort", handleOuterAbort, { once: true });

		try {
			const selectedAudio = this.meta.audioTracks.find(
				(track) => track.index === this.audioIndex,
			);
			const started = await getBridge().start({
				source: this.source,
				startTime,
				audioIndex: this.audioIndex,
				copyAudio: selectedAudio?.codec === "aac",
			});
			if (generation !== this.generation || abort.signal.aborted) {
				await getBridge().stop(started.sessionId);
				throw new DOMException("Aborted", "AbortError");
			}
			this.sessionId = started.sessionId;
			this.remuxOrigin = started.startTime;
			this.onWindowStartChange?.(this.remuxOrigin);

			if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
			const mediaSource = new MediaSource();
			this.mediaSource = mediaSource;
			this.objectUrl = URL.createObjectURL(mediaSource);
			this.video.src = this.objectUrl;
			await waitForSourceOpen(mediaSource, abort.signal);
			const mime = pickMseMimeType(this.meta.video.codecString, "mp4a.40.2");
			if (!mime) throw new Error("This video codec cannot be copied into an MP4 stream");
			const sourceBuffer = mediaSource.addSourceBuffer(mime);
			sourceBuffer.mode = "segments";
			if (this.meta.durationSeconds > 0) {
				mediaSource.duration = Math.max(0, this.meta.durationSeconds - startTime);
			}
			const response = await fetch(started.streamUrl, { signal: abort.signal });
			if (!response.ok || !response.body) {
				throw new Error(`FFmpeg stream failed with ${response.status}`);
			}
			const pump = pumpStreamToSourceBuffer(
				response.body,
				sourceBuffer,
				abort.signal,
				this.video,
				TARGET_BUFFER_AHEAD_SECONDS,
			);
			await Promise.race([
				waitForInitialBuffer(sourceBuffer, abort.signal),
				pump.then(() => {
					if (sourceBuffer.buffered.length === 0) {
						throw new Error("FFmpeg produced no playable media");
					}
				}),
			]);
			void pump.then(() => {
				if (generation === this.generation && mediaSource.readyState === "open") {
					mediaSource.endOfStream();
				}
			}).catch((error) => {
				if (!abort.signal.aborted && generation === this.generation) {
					console.error("FFmpeg stream failed", error);
				}
			});
		} catch (error) {
			abort.abort();
			await this.stopSession();
			throw error;
		} finally {
			outerSignal?.removeEventListener("abort", handleOuterAbort);
		}
	}
}
