import {
	ALL_FORMATS,
	AppendOnlyStreamTarget,
	Conversion,
	EncodedPacketSink,
	Input,
	Mp4OutputFormat,
	Output,
	type AudioCodec,
	type InputAudioTrack,
	type VideoCodec,
} from "mediabunny";
import { isDesktopPlatform } from "../platform";
import { getDirectMediaSupport, supportsEac3Playback } from "./nativeSupport";
import {
	createRemoteUrlSource,
	ensureAudioTracks,
	isMseFriendlyVideo,
	isNativeFriendlyAudio,
	probeRemoteStream,
	type ProbedStream,
} from "./probe";
import {
	isLocalFilesystemPath,
	isLocalMediaUrl,
	toClientPlayableUrl,
} from "./localSource";
import { pickMseMimeType, pumpStreamToSourceBuffer, RESUME_BUFFER_AHEAD_SECONDS, TARGET_BUFFER_AHEAD_SECONDS, getBufferedAheadSeconds } from "./msePump";
import { ensureMediaCodersRegistered } from "./registerCoders";

export type HttpPlaybackMode =
	| "direct"
	| "mediabunny"
	| "server"
	| "addon-hls"
	| "unsupported";

export type ResolvedHttpPlayback = {
	mode: HttpPlaybackMode;
	meta: ProbedStream | null;
	reason: string;
};

const BROWSER_SAFE_AUDIO = new Set<AudioCodec | null>([
	"aac",
	"mp3",
	"opus",
]);

const MSE_COPYABLE_AUDIO = new Set<AudioCodec | null>(["aac"]);

export async function resolveHttpPlayback(
	src: string,
	videoElem?: HTMLVideoElement,
	signal?: AbortSignal,
): Promise<ResolvedHttpPlayback> {
	if (!src) {
		return { mode: "unsupported", meta: null, reason: "empty" };
	}
	if (/^magnet:/i.test(src)) {
		return { mode: "server", meta: null, reason: "torrent" };
	}

	const playable = toClientPlayableUrl(src);
	const localSource =
		isLocalFilesystemPath(src) || isLocalMediaUrl(playable);

	if (!/^https?:\/\//i.test(playable) && !isLocalMediaUrl(playable)) {
		return { mode: "server", meta: null, reason: "non-http" };
	}
	if (/\.m3u8(\?|$)/i.test(playable)) {
		return { mode: "addon-hls", meta: null, reason: "addon-hls" };
	}

	const supportsEac3 = supportsEac3Playback(videoElem);
	const directSupport = getDirectMediaSupport(playable, videoElem);

	try {
		const { input, meta: probedMeta } = await probeRemoteStream(playable, signal);
		input.dispose();
		const meta = ensureAudioTracks(probedMeta);

		if (signal?.aborted) {
			throw new DOMException("Aborted", "AbortError");
		}

		// Local files go through MediaBunny — Chromium+custom-protocol <video>
		// seeking is unreliable; UrlSource range fetches are stable.
		if (localSource) {
			if (canUseMediaBunnyRemux(meta)) {
				return { mode: "mediabunny", meta, reason: "local-remux" };
			}
			if (isDesktopPlatform) {
				return { mode: "server", meta, reason: "local-fallback-server" };
			}
			return { mode: "unsupported", meta, reason: "local-unsupported" };
		}

		const audioOk = isNativeFriendlyAudio(meta.audio?.codec ?? null, supportsEac3);
		const containerOk =
			directSupport.supported &&
			(directSupport.confidence === "probably" ||
				directSupport.confidence === "maybe" ||
				directSupport.container === "unknown");

		if (containerOk && audioOk && meta.video) {
			return { mode: "direct", meta, reason: "native-compatible" };
		}

		if (!isDesktopPlatform && !containerOk) {
			const webAudioOk = BROWSER_SAFE_AUDIO.has(meta.audio?.codec ?? null);
			if (
				(directSupport.container === "video/mp4" ||
					directSupport.container === "video/webm") &&
				webAudioOk
			) {
				return { mode: "direct", meta, reason: "web-safe-container" };
			}
		}

		if (canUseMediaBunnyRemux(meta)) {
			return { mode: "mediabunny", meta, reason: "remux-or-transcode" };
		}

		if (isDesktopPlatform) {
			return { mode: "server", meta, reason: "fallback-server" };
		}

		return { mode: "unsupported", meta, reason: "no-browser-path" };
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") {
			throw error;
		}
		console.warn("MediaBunny probe failed", error);
		if (isDesktopPlatform) {
			return { mode: "server", meta: null, reason: "probe-failed" };
		}
		if (
			directSupport.supported &&
			(directSupport.confidence === "probably" ||
				directSupport.confidence === "maybe")
		) {
			return { mode: "direct", meta: null, reason: "probe-failed-direct" };
		}
		return { mode: "unsupported", meta: null, reason: "probe-failed" };
	}
}

function canUseMediaBunnyRemux(meta: ProbedStream): boolean {
	if (!meta.video) return false;
	if (!isMseFriendlyVideo(meta.video.codec) && !meta.video.canDecode) {
		return false;
	}
	return typeof MediaSource !== "undefined";
}

export type MediaBunnyAttachResult = {
	durationSeconds: number;
	objectUrl: string;
	meta: ProbedStream;
	/** Global timestamp where remux began (keyframe-snapped). */
	remuxOrigin: number;
};

export class MediaBunnyPlayback {
	private video: HTMLVideoElement | null = null;
	private mediaSource: MediaSource | null = null;
	private sourceBuffer: SourceBuffer | null = null;
	private objectUrl: string | null = null;
	private conversion: Conversion | null = null;
	private input: Input | null = null;
	private abort: AbortController | null = null;
	private generation = 0;
	private meta: ProbedStream | null = null;
	private src = "";
	private audioIndex = 0;
	private remuxOrigin = 0;
	private bufferPaused = false;
	private reachedEof = false;
	/** Fired when remux restarts at a new global timestamp (seek). */
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
	): Promise<MediaBunnyAttachResult> {
		await this.destroy();
		ensureMediaCodersRegistered();

		this.video = video;
		this.src = src;
		const startTime = Math.max(0, opts?.startTime ?? 0);

		if (opts?.meta) {
			this.meta = ensureAudioTracks(opts.meta);
		} else {
			const probed = await probeRemoteStream(src, opts?.signal);
			this.meta = ensureAudioTracks(probed.meta);
			probed.input.dispose();
		}

		const preferred =
			opts?.audioIndex ??
			this.meta.preferredAudioIndex ??
			0;
		const preferredTrack = this.meta.audioTracks.find((track) => track.index === preferred);
		if (preferredTrack?.playable && preferredTrack.bunnyIndex != null) {
			this.audioIndex = preferred;
		} else {
			const fallback = this.meta.audioTracks.find(
				(track) => track.playable && track.bunnyIndex != null,
			);
			this.audioIndex = fallback?.index ?? 0;
		}

		const snapped = await this.startPipeline(startTime, opts?.signal);
		const localTarget = Math.max(0, startTime - snapped);
		await this.settlePlayhead(localTarget, opts?.signal);

		return {
			durationSeconds: this.meta.durationSeconds,
			objectUrl: this.objectUrl!,
			meta: this.meta,
			remuxOrigin: snapped,
		};
	}

	/** Restarts remux at/near globalTime. Returns the actual remux origin (keyframe-snapped). */
	async seek(globalTime: number): Promise<number> {
		if (!this.video || !this.src || !this.meta) return globalTime;
		const clamped = Math.max(
			0,
			Math.min(this.meta.durationSeconds || globalTime, globalTime),
		);
		this.bufferPaused = false;
		this.reachedEof = false;
		const snapped = await this.startPipeline(clamped);
		await this.settlePlayhead(Math.max(0, clamped - snapped));
		return snapped;
	}

	async setAudioTrack(index: number, globalTime: number): Promise<number> {
		if (!this.video || !this.src || !this.meta) {
			throw new Error("MediaBunny playback is not attached");
		}
		const track = this.meta.audioTracks.find((entry) => entry.index === index);
		if (!track) {
			throw new Error(`Audio track ${index} is not available`);
		}
		if (!track.playable || track.bunnyIndex == null) {
			throw new Error(
				"This audio track needs the local playback server (unsupported codec for in-app remux).",
			);
		}
		this.audioIndex = index;
		this.bufferPaused = false;
		this.reachedEof = false;
		const clamped = Math.max(
			0,
			Math.min(this.meta.durationSeconds || globalTime, globalTime),
		);
		const snapped = await this.startPipeline(clamped);
		await this.settlePlayhead(Math.max(0, clamped - snapped));
		return snapped;
	}

	getRemuxOrigin(): number {
		return this.remuxOrigin;
	}

	getAudioIndex(): number {
		return this.audioIndex;
	}

	getMeta(): ProbedStream | null {
		return this.meta;
	}

	replaceMeta(meta: ProbedStream) {
		this.meta = ensureAudioTracks(meta);
	}

	async destroy(): Promise<void> {
		this.generation += 1;
		this.bufferPaused = false;
		this.reachedEof = false;
		this.abort?.abort();
		this.abort = null;

		if (this.conversion) {
			await this.cancelConversion();
		}

		if (this.input) {
			this.input.dispose();
			this.input = null;
		}

		if (this.objectUrl) {
			URL.revokeObjectURL(this.objectUrl);
			this.objectUrl = null;
		}

		this.sourceBuffer = null;
		this.mediaSource = null;
		if (this.video) {
			try {
				this.video.removeAttribute("src");
				this.video.load();
			} catch {
				// ignore
			}
		}
		this.video = null;
	}

	private async cancelConversion() {
		const conversion = this.conversion;
		this.conversion = null;
		if (!conversion) return;
		if (conversion.state === "canceled" || conversion.state === "done") return;
		try {
			await conversion.cancel();
		} catch (error) {
			if (!isBenignConversionError(error)) {
				console.warn("MediaBunny conversion cancel failed", error);
			}
		}
	}

	/**
	 * After a remux rebuild the MSE timeline starts at the keyframe (t=0). Seeking
	 * the element forward into that fresh buffer before the decoder has locked onto
	 * the keyframe freezes video while audio keeps playing — so we always land on 0
	 * and let playbackOffset carry the global time.
	 */
	private async settlePlayhead(_localTarget: number, signal?: AbortSignal) {
		const video = this.video;
		const sourceBuffer = this.sourceBuffer;
		if (!video || !sourceBuffer) return;

		try {
			video.currentTime = 0;
		} catch {
			// ignore
		}

		await waitForBufferedThrough(sourceBuffer, video, 0.35, signal);
	}

	private async waitForBufferLow(
		generation: number,
		signal: AbortSignal,
	): Promise<void> {
		const video = this.video;
		if (!video) return;

		await new Promise<void>((resolve) => {
			const check = () => {
				if (generation !== this.generation || signal.aborted) {
					cleanup();
					resolve();
					return;
				}
				if (!this.video || !this.sourceBuffer) {
					cleanup();
					resolve();
					return;
				}
				const ahead = getBufferedAheadSeconds(this.sourceBuffer, this.video);
				if (ahead <= RESUME_BUFFER_AHEAD_SECONDS) {
					cleanup();
					resolve();
				}
			};
			const onAbort = () => {
				cleanup();
				resolve();
			};
			const cleanup = () => {
				video.removeEventListener("timeupdate", check);
				signal.removeEventListener("abort", onAbort);
			};
			video.addEventListener("timeupdate", check);
			signal.addEventListener("abort", onAbort, { once: true });
			check();
		});
	}

	/**
	 * Advance Conversion in windows instead of canceling when the buffer is full.
	 * Cancel+refill rebuilt MSE from a keyframe and teleported the playhead; it also
	 * raced the writable stream (ERRORED) when the pump canceled the reader first.
	 */
	private async runConversionWindowed(
		conversion: Conversion,
		mediaSource: MediaSource,
		generation: number,
		abort: AbortController,
	): Promise<void> {
		let until = TARGET_BUFFER_AHEAD_SECONDS;
		try {
			while (generation === this.generation && !abort.signal.aborted) {
				await conversion.execute({ until });

				if (generation !== this.generation || abort.signal.aborted) return;

				if (conversion.state === "done") {
					this.reachedEof = true;
					try {
						if (mediaSource.readyState === "open") {
							mediaSource.endOfStream();
						}
					} catch {
						// ignore
					}
					return;
				}

				this.bufferPaused = true;
				await this.waitForBufferLow(generation, abort.signal);
				if (generation !== this.generation || abort.signal.aborted) return;
				this.bufferPaused = false;
				until +=
					TARGET_BUFFER_AHEAD_SECONDS - RESUME_BUFFER_AHEAD_SECONDS;
			}
		} catch (error) {
			if (generation !== this.generation) return;
			if (abort.signal.aborted) return;
			if (isBenignConversionError(error)) return;
			console.error("MediaBunny remux failed", error);
		}
	}

	private async startPipeline(startTime: number, outerSignal?: AbortSignal): Promise<number> {
		if (!this.video || !this.src || !this.meta) {
			throw new Error("MediaBunny playback is not attached");
		}

		const generation = ++this.generation;
		this.abort?.abort();
		const abort = new AbortController();
		this.abort = abort;
		this.bufferPaused = false;
		this.reachedEof = false;

		const onOuterAbort = () => abort.abort();
		outerSignal?.addEventListener("abort", onOuterAbort, { once: true });

		if (this.conversion) {
			await this.cancelConversion();
		}
		if (this.input) {
			this.input.dispose();
			this.input = null;
		}
		if (this.objectUrl) {
			URL.revokeObjectURL(this.objectUrl);
			this.objectUrl = null;
		}

		const input = new Input({
			source: createRemoteUrlSource(this.src, {
				parallelism: 2,
				maxCacheSize: 32 * 1024 * 1024,
			}),
			formats: ALL_FORMATS,
		});
		this.input = input;

		// Remux must begin on a keyframe or MSE shows a frozen frame while audio plays.
		const snappedStart = await snapToVideoKeyframe(input, startTime);
		this.remuxOrigin = snappedStart;
		this.onWindowStartChange?.(snappedStart);

		const mediaSource = new MediaSource();
		const objectUrl = URL.createObjectURL(mediaSource);
		this.mediaSource = mediaSource;
		this.objectUrl = objectUrl;
		this.video.src = objectUrl;

		await new Promise<void>((resolve, reject) => {
			const onOpen = () => {
				cleanup();
				resolve();
			};
			const onError = () => {
				cleanup();
				reject(new Error("MediaSource failed to open"));
			};
			const cleanup = () => {
				mediaSource.removeEventListener("sourceopen", onOpen);
				mediaSource.removeEventListener("error", onError);
			};
			mediaSource.addEventListener("sourceopen", onOpen);
			mediaSource.addEventListener("error", onError);
		});

		if (generation !== this.generation || abort.signal.aborted) {
			throw new DOMException("Aborted", "AbortError");
		}

		const outVideoCodec = await this.resolveOutputVideoCodec();
		const videoCodecString =
			outVideoCodec === "avc"
				? this.meta.video?.codec === "avc"
					? this.meta.video.codecString
					: "avc1.4D401F"
				: this.meta.video?.codecString;
		const mime = pickMseMimeType(videoCodecString ?? null, "mp4a.40.2");
		if (!mime) {
			throw new Error("This browser cannot play remuxed MP4 via MSE");
		}

		const sourceBuffer = mediaSource.addSourceBuffer(mime);
		sourceBuffer.mode = "segments";
		this.sourceBuffer = sourceBuffer;

		const fileDuration = this.meta.durationSeconds;
		if (Number.isFinite(fileDuration) && fileDuration > 0) {
			try {
				mediaSource.duration = Math.max(0, fileDuration - snappedStart);
			} catch {
				// ignore
			}
		}

		const { writable, readable } = new TransformStream<Uint8Array, Uint8Array>();

		const output = new Output({
			format: new Mp4OutputFormat({
				fastStart: "fragmented",
				minimumFragmentDuration: 0.5,
			}),
			target: new AppendOnlyStreamTarget(writable),
		});

		const selectedAudio = this.meta.audioTracks[this.audioIndex];
		const selectedBunnyIndex =
			selectedAudio?.bunnyIndex ??
			(selectedAudio?.playable === false ? -1 : this.audioIndex);
		const conversion = await Conversion.init({
			input,
			output,
			tracks: "all",
			showWarnings: false,
			video: async (track, n) => {
				if (n !== 1) return { discard: true };
				const codec = await track.getCodec();
				if (codec === "avc" || codec === "hevc" || codec === "av1") {
					return { codec };
				}
				if (await track.canDecode()) {
					return { codec: "avc" as VideoCodec };
				}
				return { discard: true };
			},
			audio: async (track: InputAudioTrack, n: number) => {
				const bunnyIndex = n - 1;
				if (bunnyIndex !== selectedBunnyIndex) {
					return { discard: true };
				}
				return audioConversionOptions(track);
			},
			trim: { start: snappedStart },
		});

		if (!conversion.isValid) {
			const reason = conversion.discardedTracks
				.map((entry) => `${entry.track.type}:${entry.reason}`)
				.join(", ");
			throw new Error(
				reason
					? `Unable to remux stream (${reason})`
					: "Unable to remux stream",
			);
		}

		this.conversion = conversion;

		const pump = pumpStreamToSourceBuffer(readable, sourceBuffer, abort.signal);
		const execute = this.runConversionWindowed(
			conversion,
			mediaSource,
			generation,
			abort,
		);

		void Promise.all([pump, execute]).catch((error) => {
			if (generation !== this.generation) return;
			if (abort.signal.aborted) return;
			if (isBenignConversionError(error)) return;
			console.error("MediaBunny remux failed", error);
		});

		await waitForFirstBuffer(sourceBuffer, abort.signal);
		await waitForBufferedThrough(sourceBuffer, this.video, 0.35, abort.signal);
		outerSignal?.removeEventListener("abort", onOuterAbort);
		return snappedStart;
	}

	private async resolveOutputVideoCodec(): Promise<VideoCodec> {
		const codec = this.meta?.video?.codec ?? null;
		if (codec === "avc" || codec === "hevc" || codec === "av1") return codec;
		return "avc";
	}
}

async function snapToVideoKeyframe(input: Input, startTime: number): Promise<number> {
	if (!(startTime > 0)) return 0;
	try {
		const videoTrack = await input.getPrimaryVideoTrack();
		if (!videoTrack) return startTime;
		const sink = new EncodedPacketSink(videoTrack);
		const keyPacket = await sink.getKeyPacket(startTime, {
			verifyKeyPackets: true,
		});
		if (!keyPacket || !Number.isFinite(keyPacket.timestamp)) {
			const unverified = await sink.getKeyPacket(startTime);
			if (!unverified || !Number.isFinite(unverified.timestamp)) return startTime;
			return Math.max(0, unverified.timestamp);
		}
		return Math.max(0, keyPacket.timestamp);
	} catch (error) {
		console.warn("Failed to snap remux start to keyframe", error);
		return startTime;
	}
}

function isBenignConversionError(error: unknown): boolean {
	if (error instanceof DOMException && error.name === "AbortError") return true;
	const name = error instanceof Error ? error.name : "";
	const message = error instanceof Error ? error.message : String(error);
	return (
		name === "ConversionCanceledError" ||
		/cancel|abort|ERRORED writable|QuotaExceeded|reclaimed due to inactivity/i.test(
			`${name} ${message}`,
		)
	);
}

async function audioConversionOptions(track: InputAudioTrack) {
	const codec = await track.getCodec();
	if (MSE_COPYABLE_AUDIO.has(codec)) {
		return { codec: "aac" as AudioCodec };
	}

	const channels = await track.getNumberOfChannels();
	return {
		codec: "aac" as AudioCodec,
		numberOfChannels: Math.min(2, Math.max(1, channels || 2)),
		sampleRate: 48000,
		bitrate: 160e3,
	};
}

function waitForFirstBuffer(
	sourceBuffer: SourceBuffer,
	signal: AbortSignal,
): Promise<void> {
	if (sourceBuffer.buffered.length > 0) return Promise.resolve();

	return new Promise((resolve, reject) => {
		const onUpdate = () => {
			if (sourceBuffer.buffered.length > 0) {
				cleanup();
				resolve();
			}
		};
		const onAbort = () => {
			cleanup();
			reject(new DOMException("Aborted", "AbortError"));
		};
		const timeout = window.setTimeout(() => {
			cleanup();
			reject(new Error("Timed out waiting for the first remuxed segment"));
		}, 20_000);
		const cleanup = () => {
			window.clearTimeout(timeout);
			sourceBuffer.removeEventListener("updateend", onUpdate);
			signal.removeEventListener("abort", onAbort);
		};
		sourceBuffer.addEventListener("updateend", onUpdate);
		signal.addEventListener("abort", onAbort, { once: true });
	});
}

function bufferedEndAtOrAfter(
	sourceBuffer: SourceBuffer,
	video: HTMLVideoElement | null,
	time: number,
): boolean {
	try {
		const buffered =
			video && video.buffered.length > 0 ? video.buffered : sourceBuffer.buffered;
		if (buffered.length === 0) return time <= 0;
		for (let i = 0; i < buffered.length; i++) {
			const start = buffered.start(i);
			const end = buffered.end(i);
			if (time <= 0 && end > start) return true;
			if (time >= start - 0.05 && end >= time) return true;
		}
		return false;
	} catch {
		return false;
	}
}

function waitForBufferedThrough(
	sourceBuffer: SourceBuffer,
	video: HTMLVideoElement | null,
	time: number,
	signal?: AbortSignal,
): Promise<void> {
	if (bufferedEndAtOrAfter(sourceBuffer, video, time)) {
		return Promise.resolve();
	}

	return new Promise((resolve, reject) => {
		const onUpdate = () => {
			if (bufferedEndAtOrAfter(sourceBuffer, video, time)) {
				cleanup();
				resolve();
			}
		};
		const onAbort = () => {
			cleanup();
			reject(new DOMException("Aborted", "AbortError"));
		};
		const timeout = window.setTimeout(() => {
			cleanup();
			// Don't fail the whole seek — caller can still try currentTime=0.
			resolve();
		}, 8_000);
		const cleanup = () => {
			window.clearTimeout(timeout);
			sourceBuffer.removeEventListener("updateend", onUpdate);
			signal?.removeEventListener("abort", onAbort);
		};
		sourceBuffer.addEventListener("updateend", onUpdate);
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}
