import type Hls from "hls.js";
import {
	isHttpUrl,
	isMagnetUrl,
} from "../../lib/media/localSource";
import {
	MediaBunnyPlayback,
	FfmpegPlayback,
	resolveHttpPlayback,
	type HttpPlaybackMode,
	type ProbedStream,
	type ClientPlaybackController,
} from "../../lib/media";
import * as Session from "./videoSession";

export function getBufferedRatioFromStart(video: HTMLVideoElement): number {
	const d = video.duration;
	if (!Number.isFinite(d) || d <= 0) return 0;
	const b = video.buffered;
	if (!b || b.length === 0) return 0;
	let maxEnd = 0;
	for (let i = 0; i < b.length; i++) {
		maxEnd = Math.max(maxEnd, b.end(i));
	}
	return Math.max(0, Math.min(1, maxEnd / d));
}

export type NextEpisodePrefetchHandoff = {
	sessionData: unknown;
	src: string;
	fileIdx: number | null;
	mode: HttpPlaybackMode;
	meta: ProbedStream | null;
	playbackController: ClientPlaybackController | null;
	hls: Hls | null;
};

export function canReuseNextEpisodePrefetch(
	handoff: NextEpisodePrefetchHandoff | null,
	src: string,
	fileIdx: number | null,
	startTime: number,
): handoff is NextEpisodePrefetchHandoff {
	if (!handoff || handoff.src !== src || handoff.fileIdx !== fileIdx) {
		return false;
	}
	return (
		startTime === 0 ||
		handoff.mode === "direct" ||
		handoff.mode === "addon-hls"
	);
}

const PREFETCH_READY_TIMEOUT_MS = 20_000;

const hasPlayableData = (video: HTMLVideoElement) =>
	video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA ||
	(video.buffered?.length ?? 0) > 0;

const waitForPlayableData = (
	video: HTMLVideoElement,
	signal: AbortSignal,
): Promise<void> => {
	if (hasPlayableData(video)) return Promise.resolve();

	return new Promise((resolve, reject) => {
		let timeout: ReturnType<typeof setTimeout> | null = null;

		const cleanup = () => {
			if (timeout != null) clearTimeout(timeout);
			video.removeEventListener("loadeddata", checkReady);
			video.removeEventListener("canplay", checkReady);
			video.removeEventListener("progress", checkReady);
			video.removeEventListener("error", handleError);
			signal.removeEventListener("abort", handleAbort);
		};
		const finish = (error?: unknown) => {
			cleanup();
			if (error) reject(error);
			else resolve();
		};
		const checkReady = () => {
			if (hasPlayableData(video)) finish();
		};
		const handleError = () =>
			finish(video.error ?? new Error("The prefetched video could not be loaded"));
		const handleAbort = () =>
			finish(new DOMException("Next episode prefetch aborted", "AbortError"));

		video.addEventListener("loadeddata", checkReady);
		video.addEventListener("canplay", checkReady);
		video.addEventListener("progress", checkReady);
		video.addEventListener("error", handleError, { once: true });
		signal.addEventListener("abort", handleAbort, { once: true });
		timeout = setTimeout(
			() => finish(new Error("Next episode prefetch timed out before becoming playable")),
			PREFETCH_READY_TIMEOUT_MS,
		);
		checkReady();
	});
};

export async function startNextEpisodePrefetch(
	src: string,
	fileIdx: number | null,
	videoElem: HTMLVideoElement,
	onBufferRatio: (ratio: number) => void,
	signal?: AbortSignal,
): Promise<{
	dispose: ((opts?: { transfer?: boolean }) => void) | null;
	handoff: NextEpisodePrefetchHandoff | null;
}> {
	let hlsInstance: Hls | null = null;
	let playbackController: ClientPlaybackController | null = null;
	let pollId: ReturnType<typeof setInterval> | null = null;
	let readyTimeout: ReturnType<typeof setTimeout> | null = null;
	let readyTimedOut = false;
	let disposed = false;
	const abort = new AbortController();
	const handleExternalAbort = () => abort.abort();
	signal?.addEventListener("abort", handleExternalAbort, { once: true });

	const stopPolling = () => {
		if (pollId != null) {
			clearInterval(pollId);
			pollId = null;
		}
	};

	const clearReadyTimeout = () => {
		if (readyTimeout != null) {
			clearTimeout(readyTimeout);
			readyTimeout = null;
		}
	};

	const dispose = (opts?: { transfer?: boolean }) => {
		disposed = true;
		signal?.removeEventListener("abort", handleExternalAbort);
		clearReadyTimeout();
		if (opts?.transfer) {
			stopPolling();
			playbackController = null;
			hlsInstance = null;
			return;
		}
		abort.abort();
		stopPolling();
		if (hlsInstance) {
			try {
				hlsInstance.destroy();
			} catch {
				// ignore
			}
			hlsInstance = null;
		}
		Session.detachSeekingListener(videoElem);
		const controller = playbackController;
		playbackController = null;
		if (controller) {
			void controller.destroy();
			return;
		}
		try {
			videoElem.pause();
		} catch {
			// ignore
		}
		videoElem.removeAttribute("src");
		try {
			videoElem.load();
		} catch {
			// ignore
		}
	};

	try {
		if (isMagnetUrl(src)) {
			// Limbo resolution happens on play; don't spin retries here.
			dispose();
			return { dispose: null, handoff: null };
		}

		videoElem.muted = true;
		videoElem.defaultMuted = true;
		videoElem.playsInline = true;
		videoElem.setAttribute("playsinline", "");
		videoElem.preload = "auto";

		readyTimeout = setTimeout(() => {
			readyTimedOut = true;
			abort.abort();
		}, PREFETCH_READY_TIMEOUT_MS);

		const resolved = await resolveHttpPlayback(src, videoElem, abort.signal);
		if (disposed || abort.signal.aborted) {
			if (readyTimedOut) {
				throw new Error("Next episode prefetch timed out while probing the stream");
			}
			dispose();
			return { dispose: null, handoff: null };
		}

		if (resolved.mode === "direct") {
			if (resolved.meta && isHttpUrl(src)) {
				videoElem.crossOrigin = "anonymous";
			} else {
				videoElem.removeAttribute("crossorigin");
			}
			videoElem.src = src;
			videoElem.load();
			await waitForPlayableData(videoElem, abort.signal);
			clearReadyTimeout();
			pollId = setInterval(() => {
				onBufferRatio(getBufferedRatioFromStart(videoElem));
			}, 400);
			return {
				dispose,
				handoff: {
					sessionData: { isDirectHttp: true, sourceUrl: src },
					src,
					fileIdx,
					mode: "direct",
					meta: resolved.meta,
						playbackController: null,
					hls: null,
				},
			};
		}

		if (resolved.mode === "addon-hls") {
			const HlsCtor = (await import("hls.js")).default;
			if (HlsCtor.isSupported()) {
				hlsInstance = new HlsCtor({
					enableWorker: true,
					lowLatencyMode: false,
					maxBufferLength: 40,
					maxMaxBufferLength: 60,
					backBufferLength: 0,
				});
				hlsInstance.attachMedia(videoElem);
				hlsInstance.loadSource(src);
			} else if (videoElem.canPlayType("application/vnd.apple.mpegurl")) {
				videoElem.src = src;
				videoElem.load();
			} else {
				dispose();
				return { dispose: null, handoff: null };
			}
			await waitForPlayableData(videoElem, abort.signal);
			clearReadyTimeout();
			pollId = setInterval(() => {
				onBufferRatio(getBufferedRatioFromStart(videoElem));
			}, 400);
			return {
				dispose,
				handoff: {
					sessionData: { isAddonHls: true, sourceUrl: src },
					src,
					fileIdx,
					mode: "addon-hls",
					meta: null,
						playbackController: null,
					hls: hlsInstance,
				},
			};
		}

		if (resolved.mode === "mediabunny" || resolved.mode === "ffmpeg") {
			const controller = resolved.mode === "ffmpeg"
				? new FfmpegPlayback()
				: new MediaBunnyPlayback();
			playbackController = controller;
			await controller.attach(videoElem, src, {
				startTime: 0,
				signal: abort.signal,
				meta: resolved.meta,
				audioIndex: resolved.meta?.preferredAudioIndex ?? 0,
			});
			clearReadyTimeout();
			if (disposed || abort.signal.aborted) {
				if (readyTimedOut) {
					throw new Error("Next episode prefetch timed out while preparing playback");
				}
				dispose();
				return { dispose: null, handoff: null };
			}
			pollId = setInterval(() => {
				onBufferRatio(getBufferedRatioFromStart(videoElem));
			}, 400);
			return {
				dispose,
				handoff: {
					sessionData: {
						isDirectHttp: true,
						sourceUrl: src,
						durationSeconds: resolved.meta?.durationSeconds ?? 0,
					},
					src,
					fileIdx,
					mode: resolved.mode,
					meta: controller.getMeta() ?? resolved.meta,
					playbackController: controller,
					hls: null,
				},
			};
		}

		dispose();
		return { dispose: null, handoff: null };
	} catch (e) {
		if (e instanceof DOMException && e.name === "AbortError" && !readyTimedOut) {
			dispose();
			return { dispose: null, handoff: null };
		}
		const error = readyTimedOut
			? new Error("Next episode prefetch timed out before becoming playable", {
					cause: e,
				})
			: e;
		dispose();
		throw error;
	}
}
