import type { LibraryItem } from "../db/types";

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
    items: StremioImportResultItem[];
    lastWatched: string | null;
    poster: string | null;
    warnings: string[];
}

const isPlainObject = (value: unknown): value is Record<string, any> =>
    Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toFiniteNumber = (value: unknown, fallback = 0): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const toIsoString = (value: unknown): string | null => {
    if (!value) return null;
    if (value instanceof Date) {
        const ms = value.getTime();
        return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
    }
    if (typeof value === "number") {
        if (!Number.isFinite(value)) return null;
        return new Date(value).toISOString();
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return null;
        const parsed = Date.parse(trimmed);
        if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
        return null;
    }
    return null;
};

const normalizeType = (value: unknown): "movie" | "series" | null => {
    if (typeof value !== "string") return null;
    const lower = value.toLowerCase().trim();
    if (lower === "movie" || lower === "film") return "movie";
    if (lower === "series" || lower === "show" || lower === "tv") return "series";
    return null;
};

const isStremioWatchedFlag = (value: unknown): boolean => {
    if (value === true || value === 1) return true;
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return false;
        if (trimmed === "1" || trimmed.toLowerCase() === "true") return true;
        if (Date.parse(trimmed)) return true;
    }
    return false;
};

const buildProgressEntry = (
    timeWatched: number,
    duration: number,
    watchedFlag: boolean,
    lastWatchedIso: string | null,
): StremioImportProgressEntry => {
    const safeTime = Math.max(0, toFiniteNumber(timeWatched, 0));
    const safeDuration = Math.max(0, toFiniteNumber(duration, 0));
    const ratio = safeDuration > 0 ? safeTime / safeDuration : 0;
    const completionThreshold = safeDuration > 0 ? safeDuration * 0.9 : 0;
    const watched = Boolean(watchedFlag) || (safeDuration > 0 && safeTime >= completionThreshold) || (safeDuration === 0 && safeTime === 0 && watchedFlag);
    const updatedAt = lastWatchedIso ? Date.parse(lastWatchedIso) || Date.now() : Date.now();
    return {
        time: safeTime,
        duration: safeDuration,
        watched,
        updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
    };
};

const readStateField = (state: StremioLibraryState, ...keys: string[]): unknown => {
    for (const key of keys) {
        if (key in state && state[key] !== undefined && state[key] !== null) {
            return state[key];
        }
    }
    return undefined;
};

const parseVideoIdSeasonEpisode = (videoId: unknown): { season: number | null; episode: number | null } => {
    if (typeof videoId !== "string") return { season: null, episode: null };
    const parts = videoId.split(":").map((part) => part.trim()).filter(Boolean);
    if (parts.length < 3) return { season: null, episode: null };
    const season = Number(parts[parts.length - 2]);
    const episode = Number(parts[parts.length - 1]);
    if (!Number.isFinite(season) || !Number.isFinite(episode) || season <= 0 || episode <= 0) {
        return { season: null, episode: null };
    }
    return { season, episode };
};

const normalizeLibraryState = (state: unknown): StremioLibraryState => {
    if (!isPlainObject(state)) return {};
    return {
        lastWatched: readStateField(state, "lastWatched", "last_watched") as StremioLibraryState["lastWatched"],
        season: readStateField(state, "season") as StremioLibraryState["season"],
        episode: readStateField(state, "episode") as StremioLibraryState["episode"],
        timeWatched: readStateField(state, "timeWatched", "time_watched") as StremioLibraryState["timeWatched"],
        duration: readStateField(state, "duration") as StremioLibraryState["duration"],
        watched: readStateField(state, "watched") as StremioLibraryState["watched"],
        timesWatched: readStateField(state, "timesWatched", "times_watched") as StremioLibraryState["timesWatched"],
        timeOffset: readStateField(state, "timeOffset", "time_offset") as StremioLibraryState["timeOffset"],
        overallTimeWatched: readStateField(state, "overallTimeWatched", "overall_time_watched") as StremioLibraryState["overallTimeWatched"],
        flaggedWatched: readStateField(state, "flaggedWatched", "flagged_watched") as StremioLibraryState["flaggedWatched"],
        noNotif: Boolean(readStateField(state, "noNotif", "no_notif")),
        video_id: readStateField(state, "video_id", "videoId") as StremioLibraryState["video_id"],
    };
};

const buildSeriesProgressFromState = (
    state: StremioLibraryState,
): { progress: Record<string, StremioImportProgressEntry>; lastWatched: string | null; season: number | null; episode: number | null; } => {
    let seasonRaw = state.season;
    let episodeRaw = state.episode;
    if ((seasonRaw === undefined || seasonRaw === null) && (episodeRaw === undefined || episodeRaw === null)) {
        const fromVideo = parseVideoIdSeasonEpisode(state.video_id);
        seasonRaw = fromVideo.season ?? seasonRaw;
        episodeRaw = fromVideo.episode ?? episodeRaw;
    }
    const seasonNumber = Number(seasonRaw);
    const episodeNumber = Number(episodeRaw);
    if (!Number.isFinite(seasonNumber) || !Number.isFinite(episodeNumber) || seasonNumber <= 0 || episodeNumber <= 0) {
        return { progress: {}, lastWatched: toIsoString(state.lastWatched), season: null, episode: null };
    }
    const key = `${seasonNumber}:${episodeNumber}`;
    const time = toFiniteNumber(state.timeWatched, 0);
    const duration = toFiniteNumber(state.duration, 0);
    const watched = isStremioWatchedFlag(state.watched) || toFiniteNumber(state.flaggedWatched, 0) > 0;
    const lastWatchedIso = toIsoString(state.lastWatched);
    const entry = buildProgressEntry(time, duration, watched, lastWatchedIso);
    return {
        progress: { [key]: entry },
        lastWatched: lastWatchedIso,
        season: seasonNumber,
        episode: episodeNumber,
    };
};

const buildMovieProgressFromState = (state: StremioLibraryState): StremioImportProgressEntry => {
    const time = toFiniteNumber(state.timeWatched, 0);
    const duration = toFiniteNumber(state.duration, 0);
    const watched = isStremioWatchedFlag(state.watched) || toFiniteNumber(state.flaggedWatched, 0) > 0;
    const lastWatchedIso = toIsoString(state.lastWatched);
    return buildProgressEntry(time, duration, watched, lastWatchedIso);
};

const resolveLibraryEntryData = (entry: StremioLibraryEntry): Record<string, unknown> | null => {
    if (!isPlainObject(entry)) return null;
    if (isPlainObject(entry.d)) return entry.d as Record<string, unknown>;
    if (entry._id || entry.name || entry.type) return entry as Record<string, unknown>;
    return null;
};

const convertEntryToPreview = (entry: StremioLibraryEntry): StremioImportPreviewItem | null => {
    const data = resolveLibraryEntryData(entry);
    if (!data) return null;
    if (data.removed === true) return null;

    const imdbId = String(
        (data._id as string | undefined)
            || entry.__id
            || entry._id
            || "",
    ).trim();
    if (!imdbId) return null;
    const type = normalizeType(data.type);
    if (!type) return null;
    const state = normalizeLibraryState(data.state);
    const lastWatched = toIsoString(state.lastWatched);
    const poster = typeof data.poster === "string" && data.poster.trim() ? data.poster.trim() : undefined;
    const name = typeof data.name === "string" ? data.name : imdbId;

    if (type === "series") {
        const { progress, lastWatched: derivedLastWatched, season, episode } = buildSeriesProgressFromState(state);
        const progressKeys = Object.keys(progress);
        const watched = progressKeys.length > 0 && progress[progressKeys[0]].watched;
        const firstKey = progressKeys[0];
        return {
            imdbId,
            name,
            type,
            poster,
            lastWatched: lastWatched || derivedLastWatched,
            progress,
            watched: Boolean(watched),
            timeWatched: firstKey ? progress[firstKey].time : 0,
            duration: firstKey ? progress[firstKey].duration : 0,
            season,
            episode,
        };
    }

    const entryProgress = buildMovieProgressFromState(state);
    return {
        imdbId,
        name,
        type,
        poster,
        lastWatched,
        progress: entryProgress,
        watched: entryProgress.watched,
        timeWatched: entryProgress.time,
        duration: entryProgress.duration,
        season: null,
        episode: null,
    };
};

const dedupeByImdb = (items: StremioImportPreviewItem[]): StremioImportPreviewItem[] => {
    const map = new Map<string, StremioImportPreviewItem>();
    for (const item of items) {
        const existing = map.get(item.imdbId);
        if (!existing) {
            map.set(item.imdbId, item);
            continue;
        }
        const existingTs = existing.lastWatched ? Date.parse(existing.lastWatched) : 0;
        const nextTs = item.lastWatched ? Date.parse(item.lastWatched) : 0;
        if (nextTs >= existingTs) {
            map.set(item.imdbId, { ...existing, ...item });
        }
    }
    return Array.from(map.values());
};

export interface StremioParseResult {
    items: StremioImportPreviewItem[];
    warnings: string[];
    rawCount: number;
    skippedCount: number;
    duplicateCount: number;
}

export const parseStremioLibrary = (library: StremioLibraryEntry[]): StremioParseResult => {
    const warnings: string[] = [];
    if (!library.length) {
        warnings.push("No library entries were found in your Stremio account.");
    }

    const previews: StremioImportPreviewItem[] = [];
    let skippedCount = 0;
    for (const rawEntry of library) {
        const preview = convertEntryToPreview(rawEntry);
        if (!preview) {
            skippedCount += 1;
            continue;
        }
        previews.push(preview);
    }

    const unique = dedupeByImdb(previews);
    const duplicateCount = previews.length - unique.length;
    if (duplicateCount > 0) {
        warnings.push(`Collapsed ${duplicateCount} duplicate ${duplicateCount === 1 ? "entry" : "entries"} with the same IMDb id.`);
    }
    if (skippedCount > 0) {
        warnings.push(`Skipped ${skippedCount} ${skippedCount === 1 ? "entry" : "entries"} that were not recognized as movies or series.`);
    }

    return {
        items: unique,
        warnings,
        rawCount: library.length,
        skippedCount,
        duplicateCount,
    };
};

export const parseStremioExport = (raw: string | unknown): StremioParseResult => {
    let parsed: StremioExport;
    if (typeof raw === "string") {
        try {
            parsed = JSON.parse(raw) as StremioExport;
        } catch (error) {
            throw new Error("Could not parse the Stremio export file. Make sure it is a valid JSON file.");
        }
    } else if (isPlainObject(raw)) {
        parsed = raw as StremioExport;
    } else {
        throw new Error("Unsupported Stremio export format.");
    }

    if (!isPlainObject(parsed)) {
        throw new Error("Stremio export must be a JSON object.");
    }

    const library = Array.isArray(parsed.library) ? parsed.library : [];
    const parsedLibrary = parseStremioLibrary(library as StremioLibraryEntry[]);
    if (!library.length) {
        return {
            ...parsedLibrary,
            warnings: ["No library entries were found in the export.", ...parsedLibrary.warnings],
        };
    }
    return parsedLibrary;
};

const normalizeLocalProgressEntry = (value: unknown): StremioImportProgressEntry | null => {
    if (!isPlainObject(value)) return null;
    const time = Math.max(0, toFiniteNumber((value as any).time, 0));
    const duration = Math.max(0, toFiniteNumber((value as any).duration, 0));
    const watched = Boolean((value as any).watched);
    const updatedAt = toFiniteNumber((value as any).updatedAt, 0);
    return { time, duration, watched, updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0 };
};

const isEpisodeProgressMap = (value: unknown): value is Record<string, StremioImportProgressEntry> => {
    if (!isPlainObject(value)) return false;
    return Object.values(value).some((entry) => isPlainObject(entry) && ("time" in entry || "watched" in entry));
};

const compareProgressEntries = (left: StremioImportProgressEntry, right: StremioImportProgressEntry): number => {
    if (left.watched !== right.watched) {
        return left.watched ? 1 : -1;
    }
    const leftRatio = left.duration > 0 ? left.time / left.duration : 0;
    const rightRatio = right.duration > 0 ? right.time / right.duration : 0;
    if (Math.abs(leftRatio - rightRatio) > 0.005) {
        return leftRatio > rightRatio ? 1 : -1;
    }
    if (Math.abs(left.time - right.time) > 1) {
        return left.time > right.time ? 1 : -1;
    }
    if (left.updatedAt !== right.updatedAt) {
        return left.updatedAt > right.updatedAt ? 1 : -1;
    }
    return 0;
};

const chooseProgressEntry = (
    local: StremioImportProgressEntry | null,
    incoming: StremioImportProgressEntry,
): StremioImportProgressEntry => {
    if (!local) return incoming;
    return compareProgressEntries(incoming, local) >= 0 ? { ...local, ...incoming } : { ...incoming, ...local };
};

const mergeSeriesProgress = (
    localProgress: unknown,
    incoming: Record<string, StremioImportProgressEntry>,
): { merged: Record<string, StremioImportProgressEntry>; changed: boolean } => {
    const localMap = isEpisodeProgressMap(localProgress) ? localProgress : {};
    const merged: Record<string, StremioImportProgressEntry> = { ...localMap };
    let changed = false;
    for (const [key, incomingEntry] of Object.entries(incoming)) {
        const localEntry = normalizeLocalProgressEntry(merged[key]);
        const next = chooseProgressEntry(localEntry, incomingEntry);
        if (!localEntry || compareProgressEntries(next, localEntry) !== 0) {
            changed = true;
        }
        merged[key] = next;
    }
    return { merged, changed };
};

const mergeMovieProgress = (
    localProgress: unknown,
    incoming: StremioImportProgressEntry,
): { merged: StremioImportProgressEntry; changed: boolean } => {
    const localEntry = normalizeLocalProgressEntry(localProgress);
    const merged = chooseProgressEntry(localEntry, incoming);
    const changed = !localEntry || compareProgressEntries(merged, localEntry) !== 0;
    return { merged, changed };
};

export const mergeStremioImportIntoLibrary = (
    existing: LibraryItem[],
    previews: StremioImportPreviewItem[],
): { library: LibraryItem[]; summary: StremioImportSummary } => {
    const libraryById = new Map<string, LibraryItem>();
    for (const item of existing) {
        libraryById.set(item.imdb_id, item);
    }

    const items: StremioImportResultItem[] = [];
    let added = 0;
    let merged = 0;
    let skipped = 0;
    let lastWatched: string | null = null;
    let poster: string | null = null;

    for (const preview of previews) {
        const current = libraryById.get(preview.imdbId);
        const isSeries = preview.type === "series";
        const incomingProgress = preview.progress;

        if (!current) {
            const completedAt = isSeries
                ? null
                : (incomingProgress as StremioImportProgressEntry).watched
                    ? (preview.lastWatched || new Date().toISOString())
                    : null;
            const nextItem: LibraryItem = {
                imdb_id: preview.imdbId,
                progress: isSeries
                    ? (incomingProgress as Record<string, StremioImportProgressEntry>)
                    : (incomingProgress as StremioImportProgressEntry),
                last_watched: preview.lastWatched || new Date().toISOString(),
                completed_at: completedAt,
                type: preview.type,
                shown: true,
                poster: preview.poster,
                user_id: "",
            };
            libraryById.set(preview.imdbId, nextItem);
            added += 1;
            if (!lastWatched || (preview.lastWatched && preview.lastWatched > lastWatched)) {
                lastWatched = preview.lastWatched;
            }
            if (!poster && preview.poster) poster = preview.poster;
            items.push({
                ...preview,
                progressChanged: true,
                mergedProgress: nextItem.progress as StremioImportProgress,
                newLastWatched: nextItem.last_watched,
                completedAt: nextItem.completed_at,
                action: "added",
            });
            continue;
        }

        const existingLastWatched = current.last_watched || "";
        const nextLastWatched = pickLatestTimestamp(existingLastWatched, preview.lastWatched);
        const localProgress = current.progress;

        if (isSeries) {
            const incomingMap = incomingProgress as Record<string, StremioImportProgressEntry>;
            const { merged: mergedProgress, changed: progressChanged } = mergeSeriesProgress(localProgress, incomingMap);
            if (!progressChanged && nextLastWatched === existingLastWatched) {
                skipped += 1;
                items.push({
                    ...preview,
                    progressChanged: false,
                    mergedProgress: mergedProgress as StremioImportProgress,
                    newLastWatched: existingLastWatched,
                    completedAt: current.completed_at,
                    action: "skipped",
                });
                continue;
            }
            const updated: LibraryItem = {
                ...current,
                type: preview.type,
                last_watched: nextLastWatched || existingLastWatched,
                progress: mergedProgress,
                poster: current.poster || preview.poster,
                completed_at: current.completed_at,
            };
            libraryById.set(preview.imdbId, updated);
            merged += 1;
            if (!lastWatched || (updated.last_watched && updated.last_watched > lastWatched)) {
                lastWatched = updated.last_watched;
            }
            if (!poster && updated.poster) poster = updated.poster;
            items.push({
                ...preview,
                progressChanged,
                mergedProgress: mergedProgress as StremioImportProgress,
                newLastWatched: updated.last_watched,
                completedAt: updated.completed_at,
                action: "merged",
            });
            continue;
        }

        const incomingEntry = incomingProgress as StremioImportProgressEntry;
        const { merged: mergedProgress, changed: progressChanged } = mergeMovieProgress(localProgress, incomingEntry);
        if (!progressChanged && nextLastWatched === existingLastWatched) {
            skipped += 1;
            items.push({
                ...preview,
                progressChanged: false,
                mergedProgress,
                newLastWatched: existingLastWatched,
                completedAt: current.completed_at,
                action: "skipped",
            });
            continue;
        }
        const completedAt = mergedProgress.watched
            ? (current.completed_at || preview.lastWatched || new Date().toISOString())
            : (mergedProgress.watched ? null : null);
        const updated: LibraryItem = {
            ...current,
            type: preview.type,
            last_watched: nextLastWatched || existingLastWatched,
            progress: mergedProgress,
            poster: current.poster || preview.poster,
            completed_at: completedAt,
        };
        libraryById.set(preview.imdbId, updated);
        merged += 1;
        if (!lastWatched || (updated.last_watched && updated.last_watched > lastWatched)) {
            lastWatched = updated.last_watched;
        }
        if (!poster && updated.poster) poster = updated.poster;
        items.push({
            ...preview,
            progressChanged,
            mergedProgress,
            newLastWatched: updated.last_watched,
            completedAt: updated.completed_at,
            action: "merged",
        });
    }

    const summary: StremioImportSummary = {
        total: previews.length,
        rawCount: previews.length,
        added,
        merged,
        skipped,
        movies: previews.filter((item) => item.type === "movie").length,
        series: previews.filter((item) => item.type === "series").length,
        watched: previews.filter((item) => item.watched).length,
        items,
        lastWatched,
        poster,
        warnings: [],
    };

    return { library: Array.from(libraryById.values()), summary };
};

const pickLatestTimestamp = (a: string, b: string | null): string => {
    if (!a) return b || "";
    if (!b) return a;
    const aTs = Date.parse(a) || 0;
    const bTs = Date.parse(b) || 0;
    return bTs > aTs ? b : a;
};
