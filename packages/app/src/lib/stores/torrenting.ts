import { get, writable } from "svelte/store";
import { checkLimboHealth, LimboUnavailableError } from "../limbo/client";

const ALLOW_TORRENTING_KEY = "raffi_allow_torrenting";
const TORRENT_WARNING_SHOWN_KEY = "torrentWarningShown";

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
		const health = await checkLimboHealth();
		if (!health?.ok) {
			throw new LimboUnavailableError(
				"Limbo is not running. Install and open Limbo, then try again.",
			);
		}
	}
	allowTorrenting.set(enabled);
};

/** Kept for App.svelte mount hooks; Limbo needs no preference sync. */
export const syncTorrentingPreference = async () => {};

export const ensureTorrentingAllowed = async () => {
	if (!get(allowTorrenting)) {
		throw new Error(
			"Torrenting is disabled. Turn on Allow Torrenting in Settings to play torrent sources.",
		);
	}
	const health = await checkLimboHealth();
	if (!health?.ok) {
		throw new LimboUnavailableError(
			"Limbo is not running. Install and open Limbo to play torrent sources.",
		);
	}
};
