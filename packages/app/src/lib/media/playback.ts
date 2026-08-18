import {
	ALL_FORMATS,
	AppendOnlyStreamTarget,
	Input,
	Mp4OutputFormat,
	Output,
	type InputAudioTrack,
	type InputVideoTrack,
	type VideoCodec,
} from "mediabunny";
import {
	createRemoteUrlSource,
	ensureAudioTracks,
	probeRemoteStream,
	type ProbedStream,
} from "./probe";
import { pickMseMimeType, pumpStreamToSourceBuffer, RESUME_BUFFER_AHEAD_SECONDS, TARGET_BUFFER_AHEAD_SECONDS, getBufferedAheadSeconds } from "./msePump";
import { ensureMediaCodersRegistered } from "./registerCoders";
import {
	KeyframeCopyConversion,
	type PlaybackConversion,
} from "./keyframeCopyConversion";
import { snapToVideoKeyframe } from "./videoKeyframes";
import {
	audioConversionOptions,
	createTranscodingConversion,
	isBenignConversionError,
	type MseVideoOutput,
	waitForBufferedThrough,
	waitForFirstBuffer,
} from "./playbackConversion";
export { resolveHttpPlayback, type HttpPlaybackMode, type ResolvedHttpPlayback } from "./playbackPlanning";

const MP4_COPYABLE_VIDEO = new Set<VideoCodec>(["avc", "hevc", "av1"]);

async function resolveMseVideoOutput(
	track: InputVideoTrack,
	audioCodecString: string | null,
): Promise<MseVideoOutput> {
	const sourceCodec = await track.getCodec();
	const sourceCodecString = await track.getCodecParameterString();

	if (sourceCodec && MP4_COPYABLE_VIDEO.has(sourceCodec) && sourceCodecString) {
		const mime = pickMseMimeType(sourceCodecString, audioCodecString);
		if (mime) {
			return {
				codec: sourceCodec,
				forceTranscode: false,
				mime,
			};
		}
	}

	if (!(await track.canDecode())) {
		const codec = sourceCodec?.toUpperCase() || "This";
		throw new Error(
			`${codec} video is not supported by MediaSource and cannot be decoded for H.264 transcoding`,
		);
	}

	const mime = pickMseMimeType("avc1.4D401F", audioCodecString);
	if (!mime) {
		throw new Error("This browser cannot play H.264/AAC via MediaSource");
	}

	return {
		codec: "avc",
		forceTranscode: true,
		mime,
	};
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
	private conversion: PlaybackConversion | null = null;
	private input: Input | null = null;
	private abort: AbortController | null = null;
	private networkAbort: AbortController | null = null;
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
		await ensureMediaCodersRegistered();

		this.video = video;
		this.src = src;
		const startTime = Math.max(0, opts?.startTime ?? 0);

		if (opts?.meta) {
			this.meta = ensureAudioTracks(opts.meta);
		} else {
			const probed = await probeRemoteStream(src, opts?.signal);
			this.meta = ensureAudioTracks(probed);
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
		try {
			this.video.pause();
		} catch {
			// ignore
		}
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
				"This audio track uses a codec that cannot be remuxed in-app.",
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
		this.networkAbort?.abort();
		this.networkAbort = null;
		if (this.input) {
			this.input.dispose();
			this.input = null;
		}

		if (this.video) {
			try {
				this.video.pause();
			} catch {
				// ignore
			}
		}

		if (this.conversion) {
			await this.cancelConversion();
		}

		this.abort?.abort();
		this.abort = null;

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
		conversion: PlaybackConversion,
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
			throw error;
		}
	}

	private async startPipeline(startTime: number, outerSignal?: AbortSignal): Promise<number> {
		if (!this.video || !this.src || !this.meta) {
			throw new Error("MediaBunny playback is not attached");
		}

		try {
			this.video.pause();
		} catch {
			// ignore
		}

		const generation = ++this.generation;
		this.networkAbort?.abort();
		this.networkAbort = null;
		if (this.input) {
			this.input.dispose();
			this.input = null;
		}
		if (this.conversion) {
			await this.cancelConversion();
		}
		this.abort?.abort();
		const abort = new AbortController();
		const networkAbort = new AbortController();
		this.abort = abort;
		this.networkAbort = networkAbort;
		this.bufferPaused = false;
		this.reachedEof = false;

		const onOuterAbort = () => {
			abort.abort();
			networkAbort.abort();
		};
		outerSignal?.addEventListener("abort", onOuterAbort, { once: true });

		if (this.objectUrl) {
			URL.revokeObjectURL(this.objectUrl);
			this.objectUrl = null;
		}

		const input = new Input({
			source: createRemoteUrlSource(this.src, {
				parallelism: 2,
				maxCacheSize: 32 * 1024 * 1024,
				signal: networkAbort.signal,
			}),
			formats: ALL_FORMATS,
		});
		this.input = input;

		const [primaryVideoTrack, inputAudioTracks] = await Promise.all([
			input.getPrimaryVideoTrack(),
			input.getAudioTracks(),
		]);
		if (!primaryVideoTrack) {
			throw new Error("This stream does not contain a playable video track");
		}

		const snappedStart = await snapToVideoKeyframe(primaryVideoTrack, startTime);
		this.remuxOrigin = snappedStart;
		this.onWindowStartChange?.(snappedStart);

		const selectedAudio = this.meta.audioTracks.find(
			(track) => track.index === this.audioIndex,
		);
		const selectedBunnyIndex =
			selectedAudio?.bunnyIndex ??
			(selectedAudio?.playable === false ? -1 : this.audioIndex);
		const hasSelectedAudio =
			selectedBunnyIndex >= 0 &&
			selectedBunnyIndex < inputAudioTracks.length;
		const selectedInputAudioTrack = hasSelectedAudio
			? inputAudioTracks[selectedBunnyIndex]!
			: null;
		const videoOutput = await resolveMseVideoOutput(
			primaryVideoTrack,
			hasSelectedAudio ? "mp4a.40.2" : null,
		);

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

		const sourceBuffer = mediaSource.addSourceBuffer(videoOutput.mime);
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

		const conversion = videoOutput.forceTranscode
			? await createTranscodingConversion({
					input,
					output,
					primaryVideoTrack,
					selectedInputAudioTrack,
					videoOutput,
					startTimestamp: snappedStart,
				})
			: await KeyframeCopyConversion.init({
					input,
					output,
					videoTrack: primaryVideoTrack,
					videoCodec: videoOutput.codec,
					audioTrack: selectedInputAudioTrack,
					startTimestamp: snappedStart,
					audio: audioConversionOptions,
				});

		this.conversion = conversion;
		let rejectPipeline: (error: unknown) => void = () => {};
		const pipelineFailure = new Promise<never>((_resolve, reject) => {
			rejectPipeline = reject;
		});

		const pump = pumpStreamToSourceBuffer(
			readable,
			sourceBuffer,
			abort.signal,
			this.video,
		);
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
			this.networkAbort?.abort();
			void this.cancelConversion();
			try {
				if (mediaSource.readyState === "open") {
					mediaSource.endOfStream("decode");
				}
			} catch {}
			rejectPipeline(error);
		});

		await Promise.race([
			waitForFirstBuffer(sourceBuffer, abort.signal),
			pipelineFailure,
		]);
		await Promise.race([
			waitForBufferedThrough(sourceBuffer, this.video, 0.35, abort.signal),
			pipelineFailure,
		]);
		outerSignal?.removeEventListener("abort", onOuterAbort);
		return snappedStart;
	}
}
