import type { Input } from "mediabunny";
import {
	getBufferedAheadSeconds,
	pumpStreamToSourceBuffer,
	waitForSourceBufferIdle,
} from "./msePump";

const MIB = 1024 * 1024;
const BUFFER_AHEAD_BYTES = 96 * MIB;
const BUFFER_BEHIND_BYTES = 24 * MIB;
const PLAYABLE_LEAD_SECONDS = 0.35;
const PLAYABLE_TIMEOUT_MS = 30_000;

export type BufferPolicy = {
	aheadSeconds: number;
	resumeSeconds: number;
	behindSeconds: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Sizes the buffer in bytes rather than seconds: Chromium caps a SourceBuffer at roughly
 * 150 MB, which 30 seconds of a 4K remux already exceeds, while low-bitrate streams can
 * safely buffer minutes ahead to ride out slow or flaky hosts.
 */
export function bufferPolicyFor(bytesPerSecond: number | null): BufferPolicy {
	if (!bytesPerSecond || !Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) {
		return { aheadSeconds: 30, resumeSeconds: 12, behindSeconds: 30 };
	}
	const aheadSeconds = clamp(BUFFER_AHEAD_BYTES / bytesPerSecond, 15, 120);
	return {
		aheadSeconds,
		resumeSeconds: aheadSeconds * 0.4,
		behindSeconds: clamp(BUFFER_BEHIND_BYTES / bytesPerSecond, 5, 60),
	};
}

export async function streamBufferPolicy(input: Input, durationSeconds: number) {
	if (!(durationSeconds > 0)) return bufferPolicyFor(null);
	const size = await input.source.getSizeOrNull().catch(() => null);
	return bufferPolicyFor(size ? size / durationSeconds : null);
}

function isBufferedAt(ranges: TimeRanges, time: number) {
	for (let i = 0; i < ranges.length; i++) {
		if (time >= ranges.start(i) - 0.05 && time <= ranges.end(i)) return true;
	}
	return false;
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

/**
 * One MediaSource per stream, laid out on the stream's own timeline. Each seek appends a
 * new segment at its keyframe via `timestampOffset`, so `video.currentTime` is always the
 * real playback position, seeks land exactly, and earlier buffered ranges stay playable.
 */
export class MseTimeline {
	private constructor(
		private readonly video: HTMLVideoElement,
		private readonly mediaSource: MediaSource,
		private readonly sourceBuffer: SourceBuffer,
		private readonly objectUrl: string,
		readonly policy: BufferPolicy,
	) {}

	static async open(
		video: HTMLVideoElement,
		mime: string,
		durationSeconds: number,
		policy: BufferPolicy,
		signal?: AbortSignal,
	): Promise<MseTimeline> {
		const mediaSource = new MediaSource();
		const objectUrl = URL.createObjectURL(mediaSource);
		video.src = objectUrl;
		try {
			await waitForSourceOpen(mediaSource, signal);
			const sourceBuffer = mediaSource.addSourceBuffer(mime);
			sourceBuffer.mode = "segments";
			if (durationSeconds > 0) mediaSource.duration = durationSeconds;
			return new MseTimeline(video, mediaSource, sourceBuffer, objectUrl, policy);
		} catch (error) {
			URL.revokeObjectURL(objectUrl);
			throw error;
		}
	}

	/** Starts appending a new segment whose first sample lands at `startTime`. */
	async startSegment(startTime: number) {
		await waitForSourceBufferIdle(this.sourceBuffer);
		if (this.mediaSource.readyState === "open") this.sourceBuffer.abort();
		this.sourceBuffer.timestampOffset = startTime;
	}

	pump(readable: ReadableStream<Uint8Array>, signal: AbortSignal, limitAhead: boolean) {
		return pumpStreamToSourceBuffer(readable, this.sourceBuffer, signal, this.video, {
			aheadSeconds: limitAhead ? this.policy.aheadSeconds : null,
			behindSeconds: this.policy.behindSeconds,
		});
	}

	/** Resolves once there is enough media at `time` to start playing from it. */
	waitForPlayable(time: number, signal: AbortSignal): Promise<void> {
		const duration = this.mediaSource.duration;
		const target = Number.isFinite(duration) && duration > 0
			? Math.min(time + PLAYABLE_LEAD_SECONDS, duration - 0.05)
			: time + PLAYABLE_LEAD_SECONDS;
		const playable = () =>
			isBufferedAt(this.video.buffered, target) ||
			(this.mediaSource.readyState === "ended" && isBufferedAt(this.video.buffered, time));
		if (playable()) return Promise.resolve();

		return new Promise((resolve, reject) => {
			const finish = (error?: unknown) => {
				window.clearTimeout(timeout);
				this.sourceBuffer.removeEventListener("updateend", check);
				this.mediaSource.removeEventListener("sourceended", check);
				signal.removeEventListener("abort", handleAbort);
				if (error) reject(error);
				else resolve();
			};
			const check = () => {
				if (playable()) finish();
			};
			const handleAbort = () => finish(new DOMException("Aborted", "AbortError"));
			const timeout = window.setTimeout(
				() => finish(new Error("Timed out waiting for the stream to buffer")),
				PLAYABLE_TIMEOUT_MS,
			);
			this.sourceBuffer.addEventListener("updateend", check);
			this.mediaSource.addEventListener("sourceended", check);
			signal.addEventListener("abort", handleAbort, { once: true });
		});
	}

	isBufferedAt(time: number) {
		return isBufferedAt(this.video.buffered, time);
	}

	bufferedRangeAt(time: number): { start: number; end: number } | null {
		const { buffered } = this.video;
		for (let i = 0; i < buffered.length; i++) {
			const start = buffered.start(i);
			const end = buffered.end(i);
			if (time >= start && time < end - PLAYABLE_LEAD_SECONDS) return { start, end };
		}
		return null;
	}

	/**
	 * Drops buffered media far from `time` before jumping there, so ranges left behind by
	 * earlier seeks can't exhaust the SourceBuffer quota.
	 */
	async retainAround(time: number) {
		const keepStart = time - this.policy.behindSeconds;
		const keepEnd = time + this.policy.aheadSeconds;
		const { buffered } = this.sourceBuffer;
		const removals: Array<[number, number]> = [];
		for (let i = 0; i < buffered.length; i++) {
			const start = buffered.start(i);
			const end = buffered.end(i);
			if (start < keepStart - 0.5) removals.push([start, Math.min(end, keepStart)]);
			if (end > keepEnd + 0.5) removals.push([Math.max(start, keepEnd), end]);
		}
		for (const [start, end] of removals) {
			await waitForSourceBufferIdle(this.sourceBuffer);
			this.sourceBuffer.remove(start, end);
		}
		await waitForSourceBufferIdle(this.sourceBuffer);
	}

	/** Resolves once playback has drained the buffer below `seconds` ahead of the playhead. */
	waitForBufferBelow(seconds: number, signal: AbortSignal): Promise<void> {
		return new Promise<void>((resolve) => {
			const check = () => {
				if (!signal.aborted && getBufferedAheadSeconds(this.sourceBuffer, this.video) > seconds) {
					return;
				}
				this.video.removeEventListener("timeupdate", check);
				signal.removeEventListener("abort", check);
				resolve();
			};
			this.video.addEventListener("timeupdate", check);
			signal.addEventListener("abort", check, { once: true });
			check();
		});
	}

	endOfStream(error?: "decode" | "network") {
		if (this.mediaSource.readyState !== "open" || this.sourceBuffer.updating) return;
		try {
			this.mediaSource.endOfStream(error);
		} catch {
			// The stream was already ending.
		}
	}

	destroy() {
		URL.revokeObjectURL(this.objectUrl);
		try {
			this.video.removeAttribute("src");
			this.video.load();
		} catch {
			// The element is already detached.
		}
	}
}
