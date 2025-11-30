import type { ShowResponse } from "../../lib/library/types/meta_types";

export interface MetaParams {
    imdbId: string;
    type: "movie" | "series";
    name?: string;
}

export interface LastWatched {
    season: number;
    episode: number;
}

export interface Stream {
    name: string;
    title: string;
    url?: string;
    infoHash?: string;
    fileIdx?: number;
    behaviorHints?: {
        bingeGroup?: string;
    };
}

export interface Episode {
    season: number;
    episode: number;
    title?: string;
    thumbnail?: string;
    released?: string;
    overview?: string;
    id?: string;
}

export interface ProgressItem {
    time: number;
    duration: number;
    watched: boolean;
    updatedAt: number;
}

export type ProgressMap = { [key: string]: ProgressItem } | ProgressItem;

export interface LibraryItem {
    _id: string;
    progress: ProgressMap;
}

export interface MetaState {
    loadedMeta: boolean;
    metaData: ShowResponse | null;
    episodes: number;
    seasons: number;
    seasonsArray: number[];
    currentSeason: number;
    loadingStreams: boolean;
    backgroundFailed: boolean;
    logoFailed: boolean;
}
