import { writable } from "svelte/store";
import type { ShowResponse } from "../../lib/library/types/meta_types";
import type { Addon } from "../../lib/db/db";
import type { Stream, ProgressMap, LastWatched } from "./types";

// Meta Data State
export const loadedMeta = writable<boolean>(false);
export const metaData = writable<ShowResponse | null>(null);
export const backgroundFailed = writable<boolean>(false);
export const logoFailed = writable<boolean>(false);

// Library/Progress State
export const progressMap = writable<ProgressMap>({});
export const libraryItem = writable<any>(null);
export const lastWatched = writable<LastWatched>({ season: 1, episode: 0 });

// Season/Episode State
export const episodes = writable<number>(0);
export const seasons = writable<number>(0);
export const seasonsArray = writable<number[]>([]);
export const currentSeason = writable<number>(1);
export const selectedEpisode = writable<any>(null);

// Stream State
export const streams = writable<Stream[]>([]);
export const loadingStreams = writable<boolean>(false);
export const selectedStream = writable<Stream | null>(null);
export const selectedStreamUrl = writable<string | null>(null);
export const selectedFileIdx = writable<number | null>(null);
export const selectedAddon = writable<string>("");
export const addons = writable<Addon[]>([]);

// UI State
export const streamsPopupVisible = writable<boolean>(false);

export const playerVisible = writable<boolean>(false);
export const showTorrentWarning = writable<boolean>(false);
export const pendingTorrentStream = writable<Stream | null>(null);
export const showEpisodeContextMenu = writable<boolean>(false);
export const contextMenuPos = writable<{ x: number; y: number }>({ x: 0, y: 0 });

export const contextEpisode = writable<any>(null);


// Reset function
export function resetMetaState() {
    loadedMeta.set(false);
    metaData.set(null);
    backgroundFailed.set(false);
    logoFailed.set(false);
    progressMap.set({});
    libraryItem.set(null);
    lastWatched.set({ season: 1, episode: 0 });
    episodes.set(0);
    seasons.set(0);
    seasonsArray.set([]);
    currentSeason.set(1);
    selectedEpisode.set(null);
    streams.set([]);
    loadingStreams.set(false);
    selectedStream.set(null);
    selectedStreamUrl.set(null);
    selectedFileIdx.set(null);
    selectedAddon.set("");
    addons.set([]);
    streamsPopupVisible.set(false);

    playerVisible.set(false);
    showTorrentWarning.set(false);
    pendingTorrentStream.set(null);
    showEpisodeContextMenu.set(false);
    contextMenuPos.set({ x: 0, y: 0 });
    contextEpisode.set(null);
}
