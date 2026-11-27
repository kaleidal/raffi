import { MatroskaInputFormat } from "mediabunny";
import { acquireStreamInput, type StreamInput } from "../probe/streamInput";
import { KeyframeDecoder } from "./keyframeDecoder";
import { MatroskaKeyframes, type PreviewKeyframe } from "./matroskaKeyframes";
import { PacketKeyframes } from "./packetKeyframes";
import { RangeReader } from "../probe/rangeReader";

const PREVIEW_WIDTH = 320;
const MAX_CACHED_FRAMES = 160;
const WARM_FRAMES = MAX_CACHED_FRAMES / 2;
const WARM_INTERVAL_SECONDS = 60;
const WARM_PAUSE_MS = 400;
/** Keyframes of taller sources weigh several megabytes each, too much to fetch ahead of time. */
const WARM_MAX_HEIGHT = 1600;

type KeyframeSource = {
	keyframeAt: (time: number) => Promise<PreviewKeyframe | null> | PreviewKeyframe | null;
	/** The keyframe timestamp for `time` when it is already known without any reads. */
	knownKeyframeAt: (time: number) => number | undefined;
};

type Previewer = { source: KeyframeSource; decoder: KeyframeDecoder; height: number };

export type WarmConditions = {
	getDuration: () => number;
	getPlayhead: () => number;
	/** Whether fetching now would not compete with playback. */
	canFetch: () => boolean;
};

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Matroska clusters span seconds of video, so keyframes are fetched by their cued byte
 * position. Other containers already index every sample and go through MediaBunny.
 */
async function openKeyframeSource(stream: StreamInput, src: string, signal: AbortSignal) {
	const track = await stream.input.getPrimaryVideoTrack();
	if (!track || !(await track.canDecode())) return null;
	const config = await track.getDecoderConfig();
	if (!config) return null;
	const height = await track.getDisplayHeight();

	if ((await stream.input.getFormat()) instanceof MatroskaInputFormat) {
		const keyframes = await MatroskaKeyframes.open(new RangeReader(src, signal), track.number);
		return keyframes && { config, height, source: keyframes };
	}
	return { config, height, source: new PacketKeyframes(track) };
}

/**
 * Seek bar thumbnails decoded from the stream itself. Each preview decodes only the
 * keyframe nearest the hovered time, and every hover inside the same keyframe interval
 * reuses one cached frame.
 */
export class SeekPreview {
	private readonly stream: StreamInput;
	private readonly abort = new AbortController();
	private previewer: Promise<Previewer | null> | null = null;
	private ready: Previewer | null = null;
	private frames = new Map<number, ImageBitmap>();
	private running = false;
	private queued: { time: number; resolve: (frame: ImageBitmap | null) => void } | null = null;

	constructor(readonly src: string) {
		this.stream = acquireStreamInput(src);
		void this.loadPreviewer();
	}

	/** The cached frame for `time`, when it can be answered without waiting. */
	peek(time: number): ImageBitmap | null {
		const key = this.ready?.source.knownKeyframeAt(time);
		return key === undefined ? null : this.touch(key);
	}

	/**
	 * Resolves with the frame for `time`. While a decode is running, only the newest
	 * request is kept; superseded ones resolve with null right away.
	 */
	frameAt(time: number): Promise<ImageBitmap | null> {
		return new Promise((resolve) => {
			this.queued?.resolve(null);
			this.queued = { time, resolve };
			void this.drain();
		});
	}

	/**
	 * Decodes frames across the whole video in the background, nearest the playhead first, so
	 * zoomed-out timelines open filled in. Frames someone is pointing at always go first.
	 */
	async warm({ getDuration, getPlayhead, canFetch }: WarmConditions) {
		const previewer = await this.loadPreviewer();
		if (!previewer || previewer.height > WARM_MAX_HEIGHT) return;

		while (!this.abort.signal.aborted && !(getDuration() > 0)) await pause(WARM_PAUSE_MS);
		const duration = getDuration();
		const interval = Math.max(WARM_INTERVAL_SECONDS, duration / WARM_FRAMES);
		const times = Array.from({ length: Math.floor(duration / interval) + 1 }, (_, index) => index * interval);

		while (times.length && !this.abort.signal.aborted) {
			if (this.running || this.queued || !canFetch()) {
				await pause(WARM_PAUSE_MS);
				continue;
			}
			const playhead = getPlayhead();
			times.sort((a, b) => Math.abs(a - playhead) - Math.abs(b - playhead));
			const time = times.shift()!;
			if (this.peek(time)) continue;

			this.running = true;
			try {
				await this.decode(time).catch(() => null);
			} finally {
				this.running = false;
			}
			void this.drain();
			await pause(WARM_PAUSE_MS);
		}
	}

	dispose() {
		this.abort.abort();
		this.queued?.resolve(null);
		this.queued = null;
		for (const frame of this.frames.values()) frame.close();
		this.frames.clear();
		void this.previewer?.then((previewer) => previewer?.decoder.close());
		this.stream.release();
	}

	private async drain() {
		if (this.running) return;
		this.running = true;
		try {
			while (this.queued && !this.abort.signal.aborted) {
				const { time, resolve } = this.queued;
				this.queued = null;
				resolve(await this.decode(time).catch(() => null));
			}
		} finally {
			this.running = false;
		}
	}

	private loadPreviewer(): Promise<Previewer | null> {
		this.previewer ??= openKeyframeSource(this.stream, this.src, this.abort.signal)
			.then((opened) => {
				this.ready = opened && {
					source: opened.source,
					decoder: new KeyframeDecoder(opened.config, PREVIEW_WIDTH),
					height: opened.height,
				};
				return this.ready;
			})
			.catch(() => null);
		return this.previewer;
	}

	private async decode(time: number): Promise<ImageBitmap | null> {
		const previewer = await this.loadPreviewer();
		const keyframe = await previewer?.source.keyframeAt(time);
		if (!previewer || !keyframe) return null;

		const cached = this.touch(keyframe.timestamp);
		if (cached) return cached;

		const data = await keyframe.read();
		const frame = data && (await previewer.decoder.decode(data));
		if (!frame || this.abort.signal.aborted) {
			frame?.close();
			return null;
		}
		this.frames.set(keyframe.timestamp, frame);
		while (this.frames.size > MAX_CACHED_FRAMES) {
			const oldest = this.frames.keys().next().value!;
			this.frames.get(oldest)?.close();
			this.frames.delete(oldest);
		}
		return frame;
	}

	/** Returns a cached frame and marks it as most recently used. */
	private touch(key: number) {
		const frame = this.frames.get(key);
		if (!frame) return null;
		this.frames.delete(key);
		this.frames.set(key, frame);
		return frame;
	}
}
