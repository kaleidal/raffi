import type { ProgressItem } from "../../library/types/progress";
import type {
    StremioExport,
    StremioImportPreviewItem,
    StremioLibraryEntry,
    StremioLibraryState,
    StremioParseResult,
} from "./types";
import { isPlainObject, toFiniteNumber } from "./values";

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
): ProgressItem => {
    const safeTime = Math.max(0, toFiniteNumber(timeWatched, 0));
    const safeDuration = Math.max(0, toFiniteNumber(duration, 0));
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
): { progress: Record<string, ProgressItem>; lastWatched: string | null; season: number | null; episode: number | null; } => {
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

const buildMovieProgressFromState = (state: StremioLibraryState): ProgressItem => {
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
        } catch {
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
