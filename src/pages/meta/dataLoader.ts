import { getCachedMetaData } from "../../lib/library/metaCache";
import { getAddons, getLibraryItem } from "../../lib/db/db";
import {
    loadedMeta, metaData, episodes, seasons, seasonsArray,
    libraryItem, progressMap, lastWatched, currentSeason, addons, selectedAddon
} from "./metaState";
import { get } from "svelte/store";
import type { ProgressMap } from "./types";

export async function loadAddons() {
    try {
        const dbAddons = await getAddons();
        if (dbAddons.length > 0) {
            addons.set(dbAddons);
            selectedAddon.set(dbAddons[0].transport_url);
        }
    } catch (e) {
        console.error("Failed to load addons", e);
    }
}

export async function loadMetaData(imdbID: string, titleType: string, expectedName: string) {
    if (!imdbID) return;
    loadedMeta.set(false);

    let data: any = null;
    let finalType = titleType;

    try {
        data = await getCachedMetaData(imdbID, titleType);

        if (expectedName && data.meta.name !== expectedName) {
            console.warn(`Name mismatch: expected "${expectedName}", got "${data.meta.name}". Trying fallback type.`);
            const fallbackType = titleType === "movie" ? "series" : "movie";
            data = await getCachedMetaData(imdbID, fallbackType);
            finalType = fallbackType;
        }

        if (!data.meta.logo || !data.meta.background) {
            console.warn("Missing logo or background. Trying fallback type.");
            const fallbackType = titleType === "movie" ? "series" : "movie";
            data = await getCachedMetaData(imdbID, fallbackType);
            finalType = fallbackType;
        }
    } catch (e) {
        console.warn(`Failed to load meta for ${titleType}, trying fallback`);
        try {
            const fallbackType = titleType === "movie" ? "series" : "movie";
            data = await getCachedMetaData(imdbID, fallbackType);
            finalType = fallbackType;
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
        data.meta.videos = filterUnreleasedEpisodes(data.meta.videos);
    }

    if (data && data.meta && data.meta.background) {
        try {
            await new Promise((resolve) => {
                const img = new Image();
                img.onload = resolve;
                img.onerror = resolve;
                img.src = data.meta.background || "";
                setTimeout(resolve, 5000);
            });
        } catch (e) {
            console.warn("Failed to preload background", e);
        }
    }

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
            if (item) {
                libraryItem.set(item);
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
            progressMap.set(progressData);
        }
    } else {
        progressMap.set(progressData);
    }

    loadedMeta.set(true);
    return finalType;
}
