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
    raffiSource?: "local" | "addon" | "direct";
    directPlaybackMode?: "iframe" | "player";
    directPlayerFormat?: "auto" | "hls" | "mp4" | "webm" | "dash" | "other";
    behaviorHints?: {
        bingeGroup?: string;
        filename?: string;
    };
}

export interface ProgressItem {
    time: number;
    duration: number;
    watched: boolean;
    updatedAt: number;
}

export type ProgressMap = { [key: string]: ProgressItem } | ProgressItem;
