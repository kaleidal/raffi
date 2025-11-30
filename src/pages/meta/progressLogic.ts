import { get } from "svelte/store";
import { updateLibraryProgress } from "../../lib/db/db";
import {
    progressMap, selectedEpisode, metaData, showEpisodeContextMenu,
    contextMenuPos, contextEpisode
} from "./metaState";
import type { ProgressMap, ProgressItem } from "./types";

let lastUpdate = 0;

export const getProgress = (map: ProgressMap, key?: string): ProgressItem | undefined => {
    if (!map) return undefined;
    if (key) {
        return (map as any)[key];
    }
    return map as ProgressItem;
};

export const handleProgress = async (time: number, duration: number, imdbID: string, playerHasStarted: boolean) => {
    const episode = get(selectedEpisode);
    if (!episode || !imdbID) return;
    if (!playerHasStarted) return;
    if (duration < 60) return;

    const isWatched = time > duration * 0.9;
    const data = get(metaData);
    if (!data) return;

    const type = data.meta.type;
    let currentMap = get(progressMap);

    if (type === "movie") {
        currentMap = {
            time,
            duration,
            watched: isWatched,
            updatedAt: Date.now(),
        } as any;
    } else {
        const key = `${episode.season}:${episode.episode}`;
        (currentMap as any)[key] = {
            time,
            duration,
            watched: isWatched,
            updatedAt: Date.now(),
        };
    }

    progressMap.set(currentMap);

    const now = Date.now();
    if (now - lastUpdate > 5000 || isWatched) {
        lastUpdate = now;
        await updateLibraryProgress(imdbID, currentMap, type, false);
    }
};

export const handleEpisodeContextMenu = (e: MouseEvent, episode: any) => {
    contextMenuPos.set({ x: e.clientX, y: e.clientY });
    contextEpisode.set(episode);
    showEpisodeContextMenu.set(true);
};

export const handleContextMarkWatched = async (imdbID: string) => {
    const episode = get(contextEpisode);
    if (!episode || !imdbID) return;

    const key = `${episode.season}:${episode.episode}`;
    let currentMap = get(progressMap);
    const existing = (currentMap as any)[key] || {};
    const duration = existing.duration || 0;

    (currentMap as any)[key] = {
        time: duration,
        duration: duration,
        watched: true,
        updatedAt: Date.now(),
    };

    progressMap.set(currentMap);

    const data = get(metaData);
    if (data) {
        await updateLibraryProgress(imdbID, currentMap, data.meta.type, false);
    }
};

export const handleContextMarkUnwatched = async (imdbID: string) => {
    const episode = get(contextEpisode);
    if (!episode || !imdbID) return;

    const key = `${episode.season}:${episode.episode}`;
    let currentMap = get(progressMap);
    const existing = (currentMap as any)[key] || {};

    (currentMap as any)[key] = {
        ...existing,
        time: 0,
        watched: false,
        updatedAt: Date.now(),
    };

    progressMap.set(currentMap);

    const data = get(metaData);
    if (data) {
        await updateLibraryProgress(imdbID, currentMap, data.meta.type, false);
    }
};

export const handleContextResetProgress = async (imdbID: string) => {
    const episode = get(contextEpisode);
    if (!episode || !imdbID) return;

    const key = `${episode.season}:${episode.episode}`;
    let currentMap = get(progressMap);

    if ((currentMap as any)[key]) {
        delete (currentMap as any)[key];
        progressMap.set(currentMap);

        const data = get(metaData);
        if (data) {
            await updateLibraryProgress(imdbID, currentMap, data.meta.type, false);
        }
    }
};

export const handleContextMarkSeasonWatched = async (imdbID: string) => {
    const episode = get(contextEpisode);
    const data = get(metaData);
    if (!episode || !imdbID || !data) return;

    const season = episode.season;
    const episodesInSeason = data.meta.videos.filter(
        (v: any) => v.season === season,
    );

    let currentMap = get(progressMap);

    for (const ep of episodesInSeason) {
        const key = `${ep.season}:${ep.episode}`;
        const existing = (currentMap as any)[key] || {};
        const duration = existing.duration || 0;

        (currentMap as any)[key] = {
            time: duration,
            duration: duration,
            watched: true,
            updatedAt: Date.now(),
        };
    }

    progressMap.set(currentMap);
    await updateLibraryProgress(imdbID, currentMap, data.meta.type, false);
};

export const handleContextMarkSeasonUnwatched = async (imdbID: string) => {
    const episode = get(contextEpisode);
    const data = get(metaData);
    if (!episode || !imdbID || !data) return;

    const season = episode.season;
    const episodesInSeason = data.meta.videos.filter(
        (v: any) => v.season === season,
    );

    let currentMap = get(progressMap);

    for (const ep of episodesInSeason) {
        const key = `${ep.season}:${ep.episode}`;
        const existing = (currentMap as any)[key] || {};

        (currentMap as any)[key] = {
            ...existing,
            time: 0,
            watched: false,
            updatedAt: Date.now(),
        };
    }

    progressMap.set(currentMap);
    await updateLibraryProgress(imdbID, currentMap, data.meta.type, false);
};
