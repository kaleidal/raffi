import type { LibraryItem } from "../../db/types";
import type {
    StremioImportPreviewItem,
    StremioImportProgress,
    StremioImportProgressEntry,
    StremioImportResultItem,
    StremioImportSummary,
} from "./types";
import { isPlainObject, toFiniteNumber } from "./values";

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
    if (left.updatedAt !== right.updatedAt) {
        return left.updatedAt > right.updatedAt ? 1 : -1;
    }
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
                updated_at: preview.lastWatched || new Date().toISOString(),
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
                completed_at: Object.values(mergedProgress).some((entry) => !entry.watched)
                    ? null
                    : current.completed_at,
                updated_at: new Date().toISOString(),
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
            updated_at: new Date().toISOString(),
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
        addonsTotal: 0,
        addonsAdded: 0,
        addonsSkipped: 0,
        addonsUnsupported: 0,
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
