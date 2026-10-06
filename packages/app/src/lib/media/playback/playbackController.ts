import type { ProbedStream } from "../probe/probe";

export type PlaybackAttachOptions = {
	startTime?: number;
	signal?: AbortSignal;
	meta?: ProbedStream | null;
	audioIndex?: number;
	ffmpegSource?: string;
	/** Buffers only a short lead until the player takes the stream over. */
	prefetch?: boolean;
};

export type PlaybackAttachResult = {
	durationSeconds: number;
	meta: ProbedStream;
};

/**
 * Feeds a video element through MSE on the stream's own timeline: `video.currentTime`
 * is always the real position. `seek` is only needed for unbuffered targets.
 */
export type ClientPlaybackController = {
	attach: (
		video: HTMLVideoElement,
		src: string,
		opts?: PlaybackAttachOptions,
	) => Promise<PlaybackAttachResult>;
	seek: (time: number) => Promise<void>;
	/** Gets a likely seek target ready so jumping there doesn't wait on the network. */
	prepareSeek: (time: number) => void;
	setAudioTrack: (index: number, time: number) => Promise<void>;
	setPrefetching: (prefetching: boolean) => void;
	getAudioIndex: () => number;
	getMeta: () => ProbedStream | null;
	replaceMeta: (meta: ProbedStream) => void;
	destroy: () => Promise<void>;
};
