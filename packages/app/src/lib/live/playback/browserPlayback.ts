import type Hls from "hls.js";
import type { ErrorData } from "hls.js";
import { isWeb } from "../../shell/platform";
import { describeStatus, proxyUrl } from "../network/proxy";
import type { LiveChannel } from "../types";
import type { StreamFormat } from "./format";

const NETWORK_RETRIES = 3;
const RETRY_DELAY_MS = 1500;

export type LiveStreamEvents = {
	onError: (message: string) => void;
};

const BROWSER_LIMIT = "Browsers can only play channels from servers that allow it. The desktop and Android apps play the rest.";

function describe(status: number | undefined, fallback: string) {
	if (status === 401 || status === 403) return "The provider turned this channel down. Your account may be at its connection limit.";
	if (status) return describeStatus(status, "the channel's server");
	if (isWeb) return BROWSER_LIMIT;
	return fallback;
}

async function attachHls(video: HTMLVideoElement, url: string, events: LiveStreamEvents) {
	const Hls = (await import("hls.js")).default;
	if (!Hls.isSupported()) {
		video.src = url;
		return () => video.removeAttribute("src");
	}
	const hls: Hls = new Hls({ enableWorker: true, backBufferLength: 30, liveDurationInfinity: true });
	let retries = 0;
	hls.on(Hls.Events.FRAG_LOADED, () => {
		retries = 0;
	});
	hls.on(Hls.Events.ERROR, (_event, data: ErrorData) => {
		if (!data.fatal) return;
		if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
			hls.recoverMediaError();
			return;
		}
		const status = data.response?.code || undefined;
		if (data.type === Hls.ErrorTypes.NETWORK_ERROR && !status && retries < NETWORK_RETRIES) {
			retries += 1;
			setTimeout(() => hls.startLoad(), RETRY_DELAY_MS * retries);
			return;
		}
		events.onError(describe(status, "The channel stopped sending video."));
	});
	hls.attachMedia(video);
	hls.loadSource(url);
	return () => hls.destroy();
}

async function attachMpegts(video: HTMLVideoElement, url: string, type: "mpegts" | "flv", events: LiveStreamEvents) {
	const mpegts = (await import("mpegts.js")).default;
	const player = mpegts.createPlayer(
		{ type, isLive: true, url },
		{
			enableWorker: true,
			lazyLoad: false,
			autoCleanupSourceBuffer: true,
			liveBufferLatencyChasing: true,
			liveBufferLatencyMaxLatency: 8,
			liveBufferLatencyMinRemain: 2,
		},
	);
	player.on(mpegts.Events.ERROR, (kind: string, detail: string, info?: { code?: number; msg?: string }) => {
		if (kind === mpegts.ErrorTypes.NETWORK_ERROR) {
			events.onError(describe(info?.code && info.code > 0 ? info.code : undefined, "Couldn't reach the channel."));
			return;
		}
		events.onError(
			detail === mpegts.ErrorDetails.MEDIA_CODEC_UNSUPPORTED
				? "This channel uses a format your device can't decode."
				: "The channel sent video Raffi couldn't read.",
		);
	});
	player.attachMediaElement(video);
	player.load();
	return () => {
		player.unload();
		player.detachMediaElement();
		player.destroy();
	};
}

function attachFile(video: HTMLVideoElement, url: string, events: LiveStreamEvents) {
	const fail = () => events.onError(describe(undefined, "This channel's format isn't supported."));
	video.addEventListener("error", fail, { once: true });
	video.src = url;
	return () => {
		video.removeEventListener("error", fail);
		video.removeAttribute("src");
		video.load();
	};
}

/** Starts a channel on a page's own video element and returns how to stop it. */
export async function attachLiveStream(
	video: HTMLVideoElement,
	channel: LiveChannel,
	format: StreamFormat,
	events: LiveStreamEvents,
): Promise<() => void> {
	const url = proxyUrl(channel.url, channel.headers);
	switch (format) {
		case "hls":
			return attachHls(video, url, events);
		case "mpegts":
		case "flv":
			return attachMpegts(video, url, format, events);
		case "dash":
			events.onError("This channel streams over DASH, which plays in the Android app.");
			return () => {};
		case "file":
			return attachFile(video, url, events);
	}
}
