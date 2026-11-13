import type { Writable } from "svelte/store";
import { createNativePlayback, explainNativeError } from "../../player/android/nativePlayback";
import { attachLiveStream } from "../../../lib/live/playback/browserPlayback";
import { MIME_TYPES, streamFormat } from "../../../lib/live/playback/format";
import type { LiveChannel } from "../../../lib/live/types";

export type EngineStatus = { playing: boolean; buffering: boolean; error: string | null };

export type LiveEngine = {
	start: (channel: LiveChannel) => Promise<void>;
	toggle: () => void;
	setFit: (mode: "contain" | "cover") => void;
	destroy: () => void;
};

export const STARTING: EngineStatus = { playing: false, buffering: true, error: null };

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Plays on the page's own video element, for desktop and the web. */
export function browserEngine(video: HTMLVideoElement, status: Writable<EngineStatus>): LiveEngine {
	let detach: (() => void) | null = null;
	let attempt = 0;

	const patch = (next: Partial<EngineStatus>) => status.update((current) => ({ ...current, ...next }));
	const onPlaying = () => patch({ playing: true, buffering: false });
	const onPause = () => patch({ playing: false });
	const onWaiting = () => patch({ buffering: true });
	video.addEventListener("playing", onPlaying);
	video.addEventListener("pause", onPause);
	video.addEventListener("waiting", onWaiting);

	return {
		async start(channel) {
			const current = ++attempt;
			detach?.();
			detach = null;
			status.set(STARTING);
			try {
				const format = await streamFormat(channel);
				if (current !== attempt) return;
				const stop = await attachLiveStream(video, channel, format, {
					onError: (error) => current === attempt && patch({ error, buffering: false }),
				});
				if (current !== attempt) return stop();
				detach = stop;
				await video.play().catch(() => patch({ playing: false, buffering: false }));
			} catch (error) {
				if (current === attempt) patch({ error: message(error), buffering: false });
			}
		},
		toggle: () => (video.paused ? void video.play() : video.pause()),
		setFit: (mode) => (video.style.objectFit = mode),
		destroy() {
			attempt += 1;
			detach?.();
			video.removeEventListener("playing", onPlaying);
			video.removeEventListener("pause", onPause);
			video.removeEventListener("waiting", onWaiting);
		},
	};
}

/** Hands the stream to the Android host's Media3 player, which plays every format without a page in the way. */
export function nativeEngine(status: Writable<EngineStatus>): LiveEngine {
	const playback = createNativePlayback();
	let attempt = 0;
	const unsubscribers = [
		playback.state.subscribe((state) =>
			status.update((current) => ({ ...current, playing: state.playWhenReady, buffering: state.buffering })),
		),
		playback.error.subscribe((error) => error && status.update((current) => ({ ...current, error: explainNativeError(error) }))),
	];

	return {
		async start(channel) {
			const current = ++attempt;
			status.set(STARTING);
			const format = await streamFormat(channel).catch(() => null);
			if (current !== attempt) return;
			playback.load(channel.url, 0, channel.name, {
				live: true,
				mimeType: format ? MIME_TYPES[format] : undefined,
				userAgent: channel.headers?.userAgent,
				referer: channel.headers?.referrer,
			});
		},
		toggle: () => playback.toggle(),
		setFit: (mode) => playback.setFit(mode),
		destroy() {
			attempt += 1;
			unsubscribers.forEach((unsubscribe) => unsubscribe());
			playback.destroy();
		},
	};
}
