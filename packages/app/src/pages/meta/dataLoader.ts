import { getCachedMetaData } from "../../lib/library/metaCache";
import { getAddons, getLibraryItem } from "../../lib/db/db";
import {
    loadedMeta, metaData, episodes, seasons, seasonsArray,
    progressMap, lastWatched, currentSeason, addons, selectedAddon,
    backgroundFailed, logoFailed, metaLoadError,
} from "./metaState";
import { get } from "svelte/store";
import type { ProgressMap } from "./types";

function addonHasStreamResource(addon: any): boolean {
    const resources = addon?.manifest?.resources;
    if (!Array.isArray(resources)) return false;
    return resources.some(
        (resource: any) =>
            resource === "stream" ||
            (resource && typeof resource === "object" && resource.name === "stream"),
    );
}

let metaLoadGeneration = 0;

export function cancelMetaDataLoad() {
    metaLoadGeneration += 1;
}

export async function loadAddons() {
    try {
        const dbAddons = await getAddons();
        addons.set(dbAddons);
        const streamAddon = dbAddons.find(addonHasStreamResource);
        selectedAddon.set(streamAddon?.transport_url ?? "");
    } catch (e) {
        console.error("Failed to load addons", e);
    }
}

export async function loadMetaData(imdbID: string, titleType: string, expectedName: string) {
    if (!imdbID) return;
    const generation = ++metaLoadGeneration;
    const isStale = () => generation !== metaLoadGeneration;
    loadedMeta.set(false);
    metaData.set(null);
    metaLoadError.set(null);
    backgroundFailed.set(false);
    logoFailed.set(false);
    progressMap.set({});
    lastWatched.set({ season: 1, episode: 0 });
    episodes.set(0);
    seasons.set(0);
    seasonsArray.set([]);
    currentSeason.set(1);

    let data: any = null;

    try {
        data = await getCachedMetaData(imdbID, titleType);
        if (isStale()) return;

        if (expectedName && data.meta.name !== expectedName) {
            console.warn(`Name mismatch: expected "${expectedName}", got "${data.meta.name}". Trying fallback type.`);
            const fallbackType = titleType === "movie" ? "series" : "movie";
            data = await getCachedMetaData(imdbID, fallbackType);
            if (isStale()) return;
        }
    } catch (e) {
        if (isStale()) return;
        console.warn(`Failed to load meta for ${titleType}, trying fallback`);
        try {
            const fallbackType = titleType === "movie" ? "series" : "movie";
            data = await getCachedMetaData(imdbID, fallbackType);
            if (isStale()) return;
        } catch (e2) {
            console.error("Failed to load meta (fallback)", e2);
        }
    }

    const filterUnreleasedEpisodes = (videos: any[] = []) => {
        const now = Date.now();
        return videos.filter((video) => {
            if (!video) return false;
            if (!video.released) return true;
            const releasedAt = new Date(video.released).getTime();
            if (Number.isNaN(releasedAt)) return true;
            return releasedAt <= now;
        });
    };

    if (data && data.meta && Array.isArray(data.meta.videos)) {
        data = {
            ...data,
            meta: {
                ...data.meta,
                videos: filterUnreleasedEpisodes(data.meta.videos),
            },
        };
    }

    if (isStale()) return;
    metaData.set(data);
    let progressData: ProgressMap = {};

    if (data && data.meta) {
        const availableEpisodes = (data.meta.videos || []).filter(
            (video: any) => video.season > 0,
        );
        const epCount = availableEpisodes.length;
        episodes.set(epCount);

        const seasonSet = new Set<number>(
            availableEpisodes.map((video: any) => Number(video.season) || 0),
        );
        const uniqueSeasons: number[] = Array.from(seasonSet)
            .filter((season) => season > 0)
            .sort((a, b) => a - b);

        seasons.set(uniqueSeasons.length);
        seasonsArray.set(uniqueSeasons);

        if (uniqueSeasons.length === 0) {
            currentSeason.set(0);
        } else if (!uniqueSeasons.includes(get(currentSeason))) {
            currentSeason.set(uniqueSeasons[0]);
        }

        try {
            const item = await getLibraryItem(imdbID);
            if (isStale()) return;
            if (item) {
                progressData = item.progress || {};

                // Calculate last watched
                let latest = 0;
                let latestKey = "";
                const prog = progressData;

                for (const [key, val] of Object.entries(prog)) {
                    const v = val as any;
                    if (v.updatedAt > latest) {
                        latest = v.updatedAt;
                        latestKey = key;
                    }
                }

                if (latestKey) {
                    const [s, e] = latestKey.split(":").map(Number);
                    lastWatched.set({ season: s, episode: e });
                    currentSeason.set(s);
                }
            } else {
                progressData = {};
            }
        } catch (e) {
            console.error("Failed to load library item", e);
            progressData = {};
        } finally {
            if (!isStale()) progressMap.set(progressData);
        }
    } else {
        progressMap.set(progressData);
    }

    if (isStale()) return;
    if (!data?.meta) {
        metaLoadError.set("Metadata could not be loaded for this title.");
    }
    loadedMeta.set(true);
}
