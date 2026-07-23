import { get, writable } from "svelte/store";
import { decoderFetch, ensureDecoderStarted, isDecoderReady, serverUrl } from "../client";

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
        // The server gate still prevents torrenting without explicit consent.
    }
};

const updateServerTorrenting = async (enabled: boolean) => {
    const response = await decoderFetch(`${serverUrl}/settings/torrenting`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
    });
    if (!response.ok) {
        const details = await response.text();
        throw new Error(`Could not ${enabled ? "enable" : "disable"} torrenting: ${details || response.status}`);
    }
};

export const setTorrentingAllowed = async (enabled: boolean) => {
    await ensureDecoderStarted();
    await updateServerTorrenting(enabled);
    allowTorrenting.set(enabled);
};

export const syncTorrentingPreference = async () => {
    // Lazy decoder: don't spawn the sidecar just to sync prefs on app launch.
    if (!(await isDecoderReady())) return;
    await updateServerTorrenting(get(allowTorrenting));
};

export const ensureTorrentingAllowed = async () => {
    if (!get(allowTorrenting)) {
        throw new Error("Torrenting is disabled. Turn on Allow Torrenting in Settings to play torrent sources.");
    }
    // The playback server starts with torrenting disabled. Reassert the persisted
    // preference when a torrent session actually needs the sidecar.
    await ensureDecoderStarted();
    await updateServerTorrenting(true);
};
