import { get } from "svelte/store";
import { updateLibraryProgress } from "../../lib/db/db";
import {
    progressMap, selectedEpisode, metaData, showEpisodeContextMenu,
    contextMenuPos, contextEpisode
} from "./metaState";

import type { ProgressMap, ProgressItem, SeriesProgress } from "../../lib/library/types/progress";
import type { Episode } from "../../lib/library/types/meta_types";

let lastUpdate = 0;
let lastProgressMapWrite = 0;
const PROGRESS_CLOUD_SYNC_DELAY_MS = 90_000;
const PROGRESS_MAP_UI_THROTTLE_MS = 2000;

const isEpisodeReleased = (episode: Episode): boolean => {
    if (!episode.released) return true;
    const releasedAt = new Date(episode.released).getTime();
    if (Number.isNaN(releasedAt)) return true;
    return releasedAt <= Date.now();
};

const isSeriesCompleted = (
    progress: ProgressMap,
    videos: Episode[] = [],
): boolean => {
    if (!progress) return false;
    const releasedEpisodes = videos.filter(
        (video) => video && video.season > 0 && video.episode > 0 && isEpisodeReleased(video),
    );
    if (releasedEpisodes.length === 0) return false;

    const map = progress as SeriesProgress;
    return releasedEpisodes.every((episode) => {
        const key = `${episode.season}:${episode.episode}`;
        return Boolean(map[key]?.watched);
    });
};

const isMovieCompleted = (progress: ProgressMap): boolean => {
    if (!progress) return false;
    const movieProgress = progress as ProgressItem;
    return Boolean(movieProgress.watched);
};

const determineCompletion = (
    type: string,
    progress: ProgressMap,
    videos: Episode[] = [],
): boolean => {
    if (type === "movie") {
        return isMovieCompleted(progress);
    }
    return isSeriesCompleted(progress, videos);
};

export const getProgress = (map: ProgressMap, key?: string): ProgressItem | undefined => {
    if (!map) return undefined;
    if (key) {
        return (map as SeriesProgress)[key];
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

    const now = Date.now();
    const type = data.meta.type;
    let currentMap = get(progressMap);
    let existingProgress: ProgressItem | undefined;
    const progress: ProgressItem = {
        time,
        duration,
        watched: isWatched,
        updatedAt: now,
    };

    if (type === "movie") {
        existingProgress = currentMap as ProgressItem;
        currentMap = progress;
    } else {
        const key = `${episode.season}:${episode.episode}`;
        const seriesMap = currentMap as SeriesProgress;
        existingProgress = seriesMap[key];
        currentMap = { ...seriesMap, [key]: progress };
    }

    const watchedStateChanged = Boolean(existingProgress?.watched) !== isWatched;
    if (
        isWatched
        || watchedStateChanged
        || now - lastProgressMapWrite >= PROGRESS_MAP_UI_THROTTLE_MS
    ) {
        lastProgressMapWrite = now;
        progressMap.set(currentMap);
    }

    if (now - lastUpdate > 5000 || isWatched || watchedStateChanged) {
        lastUpdate = now;
        if (lastProgressMapWrite !== now) {
            lastProgressMapWrite = now;
            progressMap.set(currentMap);
        }
        const completed = determineCompletion(type, currentMap, data.meta.videos);
        await updateLibraryProgress(
            imdbID,
            currentMap,
            type,
            completed,
            undefined,
            {
                syncDelayMs: isWatched || watchedStateChanged
                    ? undefined
                    : PROGRESS_CLOUD_SYNC_DELAY_MS,
            },
        );
    }
};

export const handleEpisodeContextMenu = (e: MouseEvent, episode: Episode) => {
    const target = e.currentTarget as HTMLElement | null;
    const container = document.querySelector(
        "[data-scroll-container]",
    ) as HTMLElement | null;
    if (target && container) {
        const menuWidth = 200;
        const menuHeight = 260;
        const minX = 16;
        const maxX = window.innerWidth - menuWidth - 16;
        const minY = 16;
        const maxY = window.innerHeight - menuHeight - 16;
        const desiredX = e.clientX + 8;
        const desiredY = e.clientY;
        const fitsRight = desiredX <= maxX;

        if (!fitsRight) {
            const leftOffset = Math.max(minX, e.clientX - menuWidth - 8);
            contextMenuPos.set({
                x: leftOffset,
                y: Math.max(minY, Math.min(desiredY, maxY)),
            });
        } else {
            contextMenuPos.set({
                x: Math.max(minX, Math.min(desiredX, maxX)),
                y: Math.max(minY, Math.min(desiredY, maxY)),
            });
        }
    } else {
        contextMenuPos.set({ x: e.clientX, y: e.clientY });
    }

    contextEpisode.set(episode);
    showEpisodeContextMenu.set(true);
};


export const handleContextMarkWatched = async (imdbID: string) => {
    const episode = get(contextEpisode);
    if (!episode || !imdbID) return;

    const key = `${episode.season}:${episode.episode}`;
    const currentMap = get(progressMap) as SeriesProgress;
    const duration = currentMap[key]?.duration || 0;

    currentMap[key] = {
        time: duration,
        duration: duration,
        watched: true,
        updatedAt: Date.now(),
    };

    progressMap.set(currentMap);

    const data = get(metaData);
    if (data) {
        const completed = determineCompletion(
            data.meta.type,
            currentMap,
            data.meta.videos,
        );
        await updateLibraryProgress(
            imdbID,
            currentMap,
            data.meta.type,
            completed,
        );
    }
};

export const handleContextMarkUnwatched = async (imdbID: string) => {
    const episode = get(contextEpisode);
    if (!episode || !imdbID) return;

    const key = `${episode.season}:${episode.episode}`;
    const currentMap = get(progressMap) as SeriesProgress;

    currentMap[key] = {
        ...currentMap[key],
        time: 0,
        watched: false,
        updatedAt: Date.now(),
    };

    progressMap.set(currentMap);

    const data = get(metaData);
    if (data) {
        const completed = determineCompletion(
            data.meta.type,
            currentMap,
            data.meta.videos,
        );
        await updateLibraryProgress(
            imdbID,
            currentMap,
            data.meta.type,
            completed ? true : false,
        );
    }
};

export const handleContextResetProgress = async (imdbID: string) => {
    const episode = get(contextEpisode);
    if (!episode || !imdbID) return;

    const key = `${episode.season}:${episode.episode}`;
    const currentMap = { ...(get(progressMap) as SeriesProgress) };

    const existing = currentMap[key];
    if (existing) {
        currentMap[key] = {
            ...existing,
            time: 0,
            watched: false,
            updatedAt: Date.now(),
        };
        progressMap.set(currentMap);

        const data = get(metaData);
        if (data) {
            const completed = determineCompletion(
                data.meta.type,
                currentMap,
                data.meta.videos,
            );
            await updateLibraryProgress(
                imdbID,
                currentMap,
                data.meta.type,
                completed,
            );
        }
    }
};

export const handleContextMarkSeasonWatched = async (imdbID: string) => {
    const episode = get(contextEpisode);
    const data = get(metaData);
    if (!episode || !imdbID || !data) return;

    const season = episode.season;
    const episodesInSeason = data.meta.videos.filter(
        (v) => v.season === season,
    );

    const currentMap = get(progressMap) as SeriesProgress;

    for (const ep of episodesInSeason) {
        const key = `${ep.season}:${ep.episode}`;
        const duration = currentMap[key]?.duration || 0;

        currentMap[key] = {
            time: duration,
            duration: duration,
            watched: true,
            updatedAt: Date.now(),
        };
    }

    progressMap.set(currentMap);
    const completed = determineCompletion(
        data.meta.type,
        currentMap,
        data.meta.videos,
    );
    await updateLibraryProgress(
        imdbID,
        currentMap,
        data.meta.type,
        completed,
    );
};

export const handleContextMarkSeasonUnwatched = async (imdbID: string) => {
    const episode = get(contextEpisode);
    const data = get(metaData);
    if (!episode || !imdbID || !data) return;

    const season = episode.season;
    const episodesInSeason = data.meta.videos.filter(
        (v) => v.season === season,
    );

    const currentMap = get(progressMap) as SeriesProgress;

    for (const ep of episodesInSeason) {
        const key = `${ep.season}:${ep.episode}`;

        currentMap[key] = {
            ...currentMap[key],
            time: 0,
            watched: false,
            updatedAt: Date.now(),
        };
    }

    progressMap.set(currentMap);
    const completed = determineCompletion(
        data.meta.type,
        currentMap,
        data.meta.videos,
    );
    await updateLibraryProgress(
        imdbID,
        currentMap,
        data.meta.type,
        completed,
    );
};
