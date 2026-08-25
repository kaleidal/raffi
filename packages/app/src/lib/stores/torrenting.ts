import { get, writable } from "svelte/store";
import { ensureLimboAvailable } from "../limbo/client";

const ALLOW_TORRENTING_KEY = "raffi_allow_torrenting";
const TORRENT_WARNING_SHOWN_KEY = "torrentWarningShown";

type TorrentSource = {
	infoHash?: unknown;
	url?: string | null;
};

export const isTorrentSource = (source: TorrentSource | null | undefined) =>
	Boolean(source?.infoHash) || /^magnet:/i.test(source?.url ?? "");

const readStoredBoolean = (key: string, fallback = false) => {
	try {
		const value = localStorage.getItem(key);
		return value == null ? fallback : value === "true";
	} catch {
		return fallback;
	}
};

export const allowTorrenting = writable(readStoredBoolean(ALLOW_TORRENTING_KEY, false));

allowTorrenting.subscribe((value) => {
	try {
		localStorage.setItem(ALLOW_TORRENTING_KEY, value ? "true" : "false");
	} catch {
		// Keep the in-memory preference usable when storage is unavailable.
	}
});

export const hasAcknowledgedTorrentWarning = () =>
	readStoredBoolean(TORRENT_WARNING_SHOWN_KEY, false);

export const acknowledgeTorrentWarning = () => {
	try {
		localStorage.setItem(TORRENT_WARNING_SHOWN_KEY, "true");
	} catch {
		// Preference still gates playback without acknowledgement storage.
	}
};

export const setTorrentingAllowed = async (enabled: boolean) => {
	if (enabled) {
		await ensureLimboAvailable();
	}
	allowTorrenting.set(enabled);
};

export const ensureTorrentingAllowed = async (signal?: AbortSignal) => {
	if (!get(allowTorrenting)) {
		throw new Error(
			"Torrenting is disabled. Turn on Allow Torrenting in Settings to play torrent sources.",
		);
	}
	await ensureLimboAvailable(signal);
};
