import type { AudioCodec } from "mediabunny";
import { isDesktopPlatform } from "../platform";
import { canUseFfmpegPlayback } from "./ffmpegPlayback";
import { isLocalFilesystemPath, isLocalMediaUrl, toClientPlayableUrl } from "./localSource";
import { getDirectMediaSupport, supportsEac3Playback } from "./nativeSupport";
import { ensureAudioTracks, isMseFriendlyVideo, isNativeFriendlyAudio, probeRemoteStream, type ProbedStream } from "./probe";

export type HttpPlaybackMode = "direct" | "mediabunny" | "ffmpeg" | "addon-hls" | "unsupported";

export type ResolvedHttpPlayback = {
	mode: HttpPlaybackMode;
	meta: ProbedStream | null;
	reason: string;
	error?: string;
};

const BROWSER_SAFE_AUDIO = new Set<AudioCodec | null>(["aac", "mp3", "opus"]);
const REMOTE_PROBE_TIMEOUT_MS = 30_000;

async function probeWithTimeout(
	src: string,
	externalSignal?: AbortSignal,
): Promise<ProbedStream> {
	const probeAbort = new AbortController();
	let timedOut = false;
	const handleExternalAbort = () => probeAbort.abort();
	externalSignal?.addEventListener("abort", handleExternalAbort, { once: true });
	const timeout = setTimeout(() => {
		timedOut = true;
		probeAbort.abort();
	}, REMOTE_PROBE_TIMEOUT_MS);

	try {
		return await probeRemoteStream(src, probeAbort.signal);
	} catch (error) {
		if (externalSignal?.aborted) {
			throw new DOMException("Playback probe aborted", "AbortError");
		}
		if (timedOut) {
			throw new Error("Timed out while probing the stream", { cause: error });
		}
		throw error;
	} finally {
		clearTimeout(timeout);
		externalSignal?.removeEventListener("abort", handleExternalAbort);
	}
}

function canUseMediaBunnyRemux(meta: ProbedStream): boolean {
	if (!meta.video) return false;
	if (meta.audio && !meta.audioTracks.some((track) => track.playable)) return false;
	if (!isMseFriendlyVideo(meta.video.codec) && !meta.video.canDecode) return false;
	return typeof MediaSource !== "undefined";
}

export async function resolveHttpPlayback(
	src: string,
	videoElem?: HTMLVideoElement,
	signal?: AbortSignal,
): Promise<ResolvedHttpPlayback> {
	if (!src) return { mode: "unsupported", meta: null, reason: "empty" };
	if (/^magnet:/i.test(src)) return { mode: "unsupported", meta: null, reason: "torrent" };

	const playable = toClientPlayableUrl(src);
	const localSource = isLocalFilesystemPath(src) || isLocalMediaUrl(playable);
	if (!/^https?:\/\//i.test(playable) && !isLocalMediaUrl(playable)) {
		return { mode: "unsupported", meta: null, reason: "non-http" };
	}
	if (/\.m3u8(\?|$)/i.test(playable)) return { mode: "addon-hls", meta: null, reason: "addon-hls" };

	const supportsEac3 = supportsEac3Playback(videoElem);
	const directSupport = getDirectMediaSupport(playable, videoElem);
	try {
		const meta = ensureAudioTracks(
			await (/^https?:\/\//i.test(playable)
				? probeWithTimeout(playable, signal)
				: probeRemoteStream(playable, signal)),
		);
		if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
		if (canUseFfmpegPlayback(meta)) return { mode: "ffmpeg", meta, reason: "unsupported-audio-transcode" };
		if (localSource) {
			return canUseMediaBunnyRemux(meta)
				? { mode: "mediabunny", meta, reason: "local-remux" }
				: { mode: "unsupported", meta, reason: "local-unsupported" };
		}

		const audioOk = isNativeFriendlyAudio(meta.audio?.codec ?? null, supportsEac3);
		const containerOk =
			directSupport.supported &&
			(directSupport.confidence === "probably" ||
				directSupport.confidence === "maybe" ||
				directSupport.container === "unknown");
		if (containerOk && audioOk && meta.video) return { mode: "direct", meta, reason: "native-compatible" };
		if (!isDesktopPlatform && !containerOk) {
			const safeContainer = directSupport.container === "video/mp4" || directSupport.container === "video/webm";
			if (safeContainer && BROWSER_SAFE_AUDIO.has(meta.audio?.codec ?? null)) {
				return { mode: "direct", meta, reason: "web-safe-container" };
			}
		}
		if (canUseMediaBunnyRemux(meta)) return { mode: "mediabunny", meta, reason: "remux-or-transcode" };
		if (meta.audio && !meta.audioTracks.some((track) => track.playable)) {
			const codecs = [...new Set(meta.audioTracks.map((track) => track.codecName || track.codec).filter((codec): codec is string => Boolean(codec)))];
			const label = codecs.length > 0 ? codecs.join(", ") : "unknown";
			return {
				mode: "unsupported",
				meta,
				reason: "unsupported-audio-codec",
				error: codecs.some((codec) => /DTS/i.test(codec))
					? "MediaBunny does not support DTS audio. Choose another audio track or stream."
					: `MediaBunny cannot decode ${label} audio on this platform. Choose another audio track or stream.`,
			};
		}
		return { mode: "unsupported", meta, reason: "no-browser-path" };
	} catch (error) {
		if (
			signal?.aborted ||
			(error instanceof DOMException && error.name === "AbortError")
		) {
			throw new DOMException("Playback probe aborted", "AbortError");
		}
		console.warn("MediaBunny probe failed", error);
		if (directSupport.supported && ["probably", "maybe"].includes(directSupport.confidence)) {
			return { mode: "direct", meta: null, reason: "probe-failed-direct" };
		}
		return { mode: "unsupported", meta: null, reason: "probe-failed", error: error instanceof Error ? error.message : String(error) };
	}
}
