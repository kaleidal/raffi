export type StremioLibraryType = "movie" | "series" | "channel" | "tv" | string;

export interface StremioLibraryState {
    lastWatched?: string | null;
    season?: number | string | null;
    episode?: number | string | null;
    timeWatched?: number | null;
    duration?: number | null;
    watched?: string | number | boolean | null;
    timesWatched?: number | null;
    timeOffset?: number | null;
    overallTimeWatched?: number | null;
    flaggedWatched?: number | null;
    noNotif?: boolean;
    video_id?: string | null;
    [key: string]: unknown;
}

export interface StremioLibraryEntry {
    __id?: string;
    _id?: string;
    d?: {
        _id?: string;
        name?: string;
        type?: StremioLibraryType;
        poster?: string;
        posterShape?: string;
        background?: string;
        logo?: string;
        year?: string;
        state?: StremioLibraryState;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

export interface StremioExport {
    addons?: unknown;
    library?: StremioLibraryEntry[];
    nif?: unknown;
    nim?: unknown;
    user?: unknown;
    [key: string]: unknown;
}

export interface StremioImportProgressEntry {
    time: number;
    duration: number;
    watched: boolean;
    updatedAt: number;
}

export type StremioImportProgress =
    | StremioImportProgressEntry
    | Record<string, StremioImportProgressEntry>;

export interface StremioImportPreviewItem {
    imdbId: string;
    name: string;
    type: "movie" | "series";
    poster: string | undefined;
    lastWatched: string | null;
    progress: StremioImportProgress;
    watched: boolean;
    timeWatched: number;
    duration: number;
    season: number | null;
    episode: number | null;
}

export interface StremioImportResultItem extends StremioImportPreviewItem {
    progressChanged: boolean;
    mergedProgress: StremioImportProgress;
    newLastWatched: string | null;
    completedAt: string | null;
    action: "added" | "merged" | "skipped";
}

export interface StremioImportSummary {
    total: number;
    rawCount: number;
    added: number;
    merged: number;
    skipped: number;
    movies: number;
    series: number;
    watched: number;
    addonsTotal: number;
    addonsAdded: number;
    addonsSkipped: number;
    addonsUnsupported: number;
    items: StremioImportResultItem[];
    lastWatched: string | null;
    poster: string | null;
    warnings: string[];
}

export interface StremioParseResult {
    items: StremioImportPreviewItem[];
    warnings: string[];
    rawCount: number;
    skippedCount: number;
    duplicateCount: number;
}
