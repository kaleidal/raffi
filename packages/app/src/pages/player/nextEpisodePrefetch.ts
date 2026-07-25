import type Hls from "hls.js";
import { isMagnetUrl } from "../../lib/media/localSource";
import { resolveHttpPlayback } from "../../lib/media/playback";
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
};

export async function startNextEpisodePrefetch(
	src: string,
	fileIdx: number | null,
	videoElem: HTMLVideoElement,
	onBufferRatio: (ratio: number) => void,
): Promise<{
	dispose: ((opts?: { transfer?: boolean }) => void) | null;
	handoff: NextEpisodePrefetchHandoff | null;
}> {
	let hlsInstance: Hls | null = null;
	let pollId: ReturnType<typeof setInterval> | null = null;
	let disposed = false;

	const stopPolling = () => {
		if (pollId != null) {
			clearInterval(pollId);
			pollId = null;
		}
	};

	const dispose = (_opts?: { transfer?: boolean }) => {
		disposed = true;
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
			return { dispose: null, handoff: null };
		}

		videoElem.muted = true;
		videoElem.defaultMuted = true;
		videoElem.playsInline = true;
		videoElem.setAttribute("playsinline", "");
		videoElem.preload = "auto";

		const resolved = await resolveHttpPlayback(src, videoElem);
		if (disposed) {
			dispose();
			return { dispose: null, handoff: null };
		}

		if (resolved.mode === "direct" || resolved.mode === "addon-hls") {
			videoElem.src = src;
			videoElem.load();
			pollId = setInterval(() => {
				onBufferRatio(getBufferedRatioFromStart(videoElem));
			}, 400);
			return { dispose, handoff: null };
		}

		return { dispose: null, handoff: null };
	} catch (e) {
		console.warn("Next episode prefetch failed", e);
		dispose();
		return { dispose: null, handoff: null };
	}
}
