import { writable } from "svelte/store";
import { onNative, sendNative } from "../../../lib/android/bridge";
import { nativeVideoVisible } from "../../../lib/android/nativeVideo";

export type NativePlaybackState = {
	playing: boolean;
	playWhenReady: boolean;
	buffering: boolean;
	ended: boolean;
	position: number;
	duration: number;
	buffered: number;
};

export type NativeTrack = {
	id: string;
	label: string;
	lang: string;
	selected: boolean;
	addon: boolean;
};

export type NativeTracks = { audio: NativeTrack[]; subtitles: NativeTrack[] };

export type NativeError = { message: string; details: string };

/** What a live channel adds: start at the live edge, a format hint for addresses without an extension, and provider headers. */
export type NativeLoadOptions = {
	live?: boolean;
	mimeType?: string;
	userAgent?: string;
	referer?: string;
};

export type SubtitleChoice =
	| { kind: "off" }
	| { kind: "embedded"; id: string }
	| { kind: "addon"; url: string; lang: string; label: string };

const ERROR_EXPLANATIONS: Record<string, string> = {
	ERROR_CODE_IO_BAD_HTTP_STATUS: "The stream's server turned the request down. The link may have expired.",
	ERROR_CODE_IO_NETWORK_CONNECTION_FAILED: "Couldn't reach the stream's server.",
	ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT: "The stream's server took too long to answer.",
	ERROR_CODE_IO_FILE_NOT_FOUND: "The stream's file is gone from its server.",
	ERROR_CODE_DECODING_FORMAT_UNSUPPORTED: "This device can't decode the stream's video or audio.",
	ERROR_CODE_DECODER_INIT_FAILED: "This device can't decode the stream's video or audio.",
	ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED: "This file type isn't supported.",
	ERROR_CODE_PARSING_CONTAINER_MALFORMED: "The stream's file is damaged.",
};

export const explainNativeError = ({ message, details }: NativeError) =>
	ERROR_EXPLANATIONS[message] ?? (details || message);

const INITIAL_STATE: NativePlaybackState = {
	playing: false,
	playWhenReady: false,
	buffering: true,
	ended: false,
	position: 0,
	duration: 0,
	buffered: 0,
};

/** Drives the Android host's Media3 player; video renders beneath the transparent page. */
export function createNativePlayback() {
	const state = writable<NativePlaybackState>(INITIAL_STATE);
	const tracks = writable<NativeTracks>({ audio: [], subtitles: [] });
	const error = writable<NativeError | null>(null);
	let latest = INITIAL_STATE;

	const unsubscribers = [
		onNative<NativePlaybackState>("player.state", (message) => {
			latest = message;
			state.set(message);
		}),
		onNative<NativeTracks>("player.tracks", ({ audio, subtitles }) => tracks.set({ audio, subtitles })),
		onNative<NativeError>("player.error", ({ message, details }) => error.set({ message, details })),
	];
	sendNative({ type: "screen.fullscreen", on: true });

	return {
		state,
		tracks,
		error,
		load(url: string, startTime: number, title: string, options: NativeLoadOptions = {}) {
			error.set(null);
			sendNative({ type: "player.load", url, startMs: Math.round(startTime * 1000), title, ...options });
			nativeVideoVisible.set(true);
		},
		play: () => sendNative({ type: "player.play" }),
		pause: () => sendNative({ type: "player.pause" }),
		toggle() {
			sendNative({ type: latest.playWhenReady ? "player.pause" : "player.play" });
		},
		seek(time: number) {
			const target = Math.max(0, latest.duration > 0 ? Math.min(time, latest.duration) : time);
			latest = { ...latest, position: target };
			state.set(latest);
			sendNative({ type: "player.seek", ms: Math.round(target * 1000) });
		},
		selectAudio: (id: string) => sendNative({ type: "player.audio", id }),
		selectSubtitle: (choice: SubtitleChoice) => sendNative({ type: "player.subtitle", ...choice }),
		setFit: (mode: "contain" | "cover") => sendNative({ type: "player.fit", mode }),
		/** Lifts subtitles by this share of the screen height so they clear the controls. */
		setCaptionInset: (fraction: number) => sendNative({ type: "player.captionInset", fraction }),
		current: () => latest,
		destroy() {
			unsubscribers.forEach((unsubscribe) => unsubscribe());
			sendNative({ type: "player.stop" });
			sendNative({ type: "screen.fullscreen", on: false });
			nativeVideoVisible.set(false);
		},
	};
}

export type NativePlayback = ReturnType<typeof createNativePlayback>;
