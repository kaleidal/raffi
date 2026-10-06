import type { InputVideoTrack } from "mediabunny";
import { MseTimeline, streamBufferPolicy } from "./mseTimeline";
import type {
	ClientPlaybackController,
	PlaybackAttachOptions,
	PlaybackAttachResult,
} from "./playbackController";
import type { ProbedStream } from "../probe/probe";
import type { StreamInput } from "../probe/streamInput";
import { snapToVideoKeyframe } from "./videoKeyframes";

const PREPARED_SECONDS = 4;

const abortError = () => new DOMException("Aborted", "AbortError");

/** Media rendered ahead of time for a likely seek target, such as the end of an intro. */
type PreparedSeek = {
	target: number;
	keyframe: number;
	chunks: Uint8Array[] | null;
	abort: AbortController;
};

export const isAbortError = (error: unknown) =>
	error instanceof DOMException && error.name === "AbortError";

/**
 * Shared seeking and buffering for controllers that produce MP4 fragments into MSE.
 * Subclasses only decide how media is produced from a keyframe onwards.
 */
export abstract class MsePlayback implements ClientPlaybackController {
	protected video: HTMLVideoElement | null = null;
	protected meta: ProbedStream | null = null;
	protected stream: StreamInput | null = null;
	protected videoTrack: InputVideoTrack | null = null;
	protected timeline: MseTimeline | null = null;
	protected audioIndex = 0;
	protected prefetching = false;
	private windowAbort: AbortController | null = null;
	private prepared: PreparedSeek | null = null;
	private feedStart: number | null = null;
	private generation = 0;

	abstract attach(
		video: HTMLVideoElement,
		src: string,
		opts?: PlaybackAttachOptions,
	): Promise<PlaybackAttachResult>;

	abstract setAudioTrack(index: number, time: number): Promise<void>;

	/** MSE type for the produced fragments with the current audio selection. */
	protected abstract mimeType(): Promise<string>;

	/**
	 * Starts producing fragments whose timestamps begin at 0 for `keyframe`, piping them
	 * into the timeline. Resolves once production is set up; `done` settles at the end.
	 */
	protected abstract startFeed(
		timeline: MseTimeline,
		keyframe: number,
		signal: AbortSignal,
	): Promise<{ done: Promise<void> }>;

	/** Stops production before the timeline stops consuming it. */
	protected abstract stopFeed(): Promise<void>;

	/** Produces `seconds` of fragments from `keyframe` into memory without touching the timeline. */
	protected renderClip?(keyframe: number, seconds: number, signal: AbortSignal): Promise<Uint8Array[]>;

	async seek(time: number): Promise<void> {
		const target = this.clampTime(time);
		const { video, timeline } = this;
		if (!video || !timeline) throw new Error("Playback is not attached");

		const range = timeline.bufferedRangeAt(target) ?? (await this.appendPrepared(target));
		if (!range) {
			if (!this.prepared?.chunks) this.discardPrepared();
			await this.startWindow(target, true);
			return;
		}

		video.currentTime = target;
		if (this.feedStart == null || this.feedStart < range.start - 1 || this.feedStart > range.end) {
			void this.startWindow(range.end, false).catch((error) => {
				if (!isAbortError(error)) console.error("Failed to continue buffering", error);
			});
		}
	}

	/** Renders the first seconds after `time` so a later seek there starts instantly. */
	prepareSeek(time: number) {
		const target = this.clampTime(time);
		if (!this.renderClip || !this.timeline) return;
		if (this.timeline.bufferedRangeAt(target)) {
			if (this.prepared?.target === target) this.discardPrepared();
			return;
		}
		if (this.prepared?.target === target) return;
		this.discardPrepared();
		const prepared: PreparedSeek = { target, keyframe: target, chunks: null, abort: new AbortController() };
		this.prepared = prepared;
		void this.renderPrepared(prepared).catch((error) => {
			if (!isAbortError(error)) console.warn("Failed to prepare seek target", error);
		});
	}

	getAudioIndex() {
		return this.audioIndex;
	}

	setPrefetching(prefetching: boolean) {
		this.prefetching = prefetching;
		this.timeline?.setPrefetching(prefetching);
	}

	getMeta() {
		return this.meta;
	}

	replaceMeta(meta: ProbedStream) {
		this.meta = meta;
	}

	async destroy() {
		this.generation += 1;
		this.discardPrepared();
		this.video?.pause();
		await this.stopWindow();
		this.timeline?.destroy();
		this.timeline = null;
		this.stream?.release();
		this.stream = null;
		this.videoTrack = null;
		this.video = null;
	}

	protected clampTime(time: number) {
		const duration = this.meta?.durationSeconds || time;
		return Math.max(0, Math.min(duration, time));
	}

	/** Opens a fresh timeline, dropping everything buffered with the previous audio. */
	protected async openTimeline(signal?: AbortSignal) {
		if (!this.video || !this.stream || !this.meta) throw new Error("Playback is not attached");
		await this.stopWindow();
		const mime = await this.mimeType();
		this.timeline?.destroy();
		this.timeline = await MseTimeline.open(
			this.video,
			mime,
			this.meta.durationSeconds,
			await streamBufferPolicy(this.stream.input, this.meta.durationSeconds),
			signal,
		);
		this.timeline.setPrefetching(this.prefetching);
	}

	/** Switches audio by rebuilding the timeline at `time`. */
	protected async restartAt(time: number) {
		this.discardPrepared();
		await this.openTimeline();
		await this.startWindow(this.clampTime(time), true);
	}

	private discardPrepared() {
		this.prepared?.abort.abort();
		this.prepared = null;
	}

	private async renderPrepared(prepared: PreparedSeek) {
		if (!this.renderClip) return;
		const { signal } = prepared.abort;
		const keyframe = this.videoTrack ? await snapToVideoKeyframe(this.videoTrack, prepared.target) : prepared.target;
		if (signal.aborted) return;
		const chunks = await this.renderClip(keyframe, prepared.target - keyframe + PREPARED_SECONDS, signal);
		if (signal.aborted) return;
		prepared.keyframe = keyframe;
		prepared.chunks = chunks;
	}

	/** Moves a prepared clip into the timeline when it covers `target`. */
	private async appendPrepared(target: number) {
		const prepared = this.prepared;
		const timeline = this.timeline;
		const covers =
			prepared?.chunks && target >= prepared.keyframe && target <= prepared.target + PREPARED_SECONDS / 2;
		if (!covers || !timeline) return null;
		this.prepared = null;

		const generation = ++this.generation;
		await this.stopWindow();
		if (generation !== this.generation) throw abortError();
		const abort = new AbortController();
		this.windowAbort = abort;
		await timeline.retainAround(target);
		await timeline.startSegment(prepared.keyframe);
		await timeline.pump(new Blob(prepared.chunks as BlobPart[]).stream(), abort.signal, false);
		if (generation !== this.generation) throw abortError();
		return timeline.bufferedRangeAt(target);
	}

	private async stopWindow() {
		const windowAbort = this.windowAbort;
		this.windowAbort = null;
		this.feedStart = null;
		await this.stopFeed();
		windowAbort?.abort();
	}

	/**
	 * Produces media from the keyframe at or before `time`. A hard seek also moves the
	 * playhead to exactly `time` and waits until it can play; a continuation only extends
	 * the buffer behind the playhead's current range.
	 */
	protected async startWindow(time: number, hardSeek: boolean, outerSignal?: AbortSignal) {
		const generation = ++this.generation;
		await this.stopWindow();
		if (generation !== this.generation) throw abortError();
		const { video, timeline } = this;
		if (!video || !timeline) throw new Error("Playback is not attached");

		const abort = new AbortController();
		this.windowAbort = abort;
		const onOuterAbort = () => abort.abort();
		outerSignal?.addEventListener("abort", onOuterAbort, { once: true });
		const ensureCurrent = () => {
			if (generation !== this.generation || abort.signal.aborted) throw abortError();
		};

		try {
			if (hardSeek) video.pause();
			const keyframe = this.videoTrack ? await snapToVideoKeyframe(this.videoTrack, time) : time;
			ensureCurrent();
			if (hardSeek) await timeline.retainAround(time);
			await timeline.startSegment(keyframe);
			ensureCurrent();
			this.feedStart = keyframe;

			const { done } = await this.startFeed(timeline, keyframe, abort.signal);
			ensureCurrent();
			const feed = done.then(
				() => {
					if (generation === this.generation) timeline.endOfStream();
				},
				(error) => {
					if (generation !== this.generation || abort.signal.aborted) return;
					timeline.endOfStream("decode");
					throw error;
				},
			);
			feed.catch((error) => console.error("Playback stream failed", error));

			if (!hardSeek) return;
			video.currentTime = time;
			await Promise.race([timeline.waitForPlayable(time, abort.signal), feed]);
			ensureCurrent();
			if (!timeline.isBufferedAt(time)) throw new Error("The stream produced no playable media");
		} catch (error) {
			if (generation === this.generation && !isAbortError(error)) await this.stopWindow();
			throw error;
		} finally {
			outerSignal?.removeEventListener("abort", onOuterAbort);
		}
	}
}
