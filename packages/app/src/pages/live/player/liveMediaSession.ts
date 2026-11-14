import { logoUrl } from "../../../lib/live/network/proxy";
import type { LiveChannel, Programme } from "../../../lib/live/types";

type Controls = { toggle: () => void; zap: (step: number) => void };

const ACTIONS = ["play", "pause", "previoustrack", "nexttrack"] as const;

/** Shows the channel and what's on in the system's media controls; previous and next change channel. */
export function bindLiveMediaSession(channel: LiveChannel, airing: Programme | null, { toggle, zap }: Controls) {
	if (!("mediaSession" in navigator)) return;
	const session = navigator.mediaSession;
	const logo = logoUrl(channel.logo);
	session.metadata = new MediaMetadata({
		title: airing?.title || channel.name,
		artist: airing ? channel.name : "Live TV",
		artwork: logo ? [{ src: logo }] : [],
	});
	session.setActionHandler("play", toggle);
	session.setActionHandler("pause", toggle);
	session.setActionHandler("previoustrack", () => zap(-1));
	session.setActionHandler("nexttrack", () => zap(1));
}

export function clearLiveMediaSession() {
	if (!("mediaSession" in navigator)) return;
	navigator.mediaSession.metadata = null;
	for (const action of ACTIONS) navigator.mediaSession.setActionHandler(action, null);
}
