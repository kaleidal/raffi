import type { LibraryItem } from "../db/types";
import {
    LOCAL_LIBRARY_KEY,
    getLocalUserId,
    isCloudBackupEnabled,
    markDirty,
    pauseCloudSync,
    publishCloudSyncStatus,
    readLocal,
    resumeCloudSync,
    writeLocal,
} from "../db/state";
import { syncCloudBackupNow } from "../db/sync";
import { addAddon, getAddons } from "../db/data";
import { mergeStremioImportIntoLibrary } from "./stremioLibrary/merge";
import { parseStremioExport, parseStremioLibrary } from "./stremioLibrary/parse";
import type {
    StremioImportPreviewItem,
    StremioImportSummary,
    StremioLibraryEntry,
} from "./stremioLibrary/types";
import {
    importStremioAddons,
    normalizeStremioTransportUrl,
    parseStremioAddonsFromExport,
    type StremioAddonDescriptor,
    type StremioAddonImportResult,
} from "./stremioAddons";

export type StremioImportProgressEvent =
    | { phase: "fetching" }
    | { phase: "parsing"; rawCount?: number }
    | { phase: "importing_addons" }
    | { phase: "applying"; processed: number; total: number; current?: string }
    | { phase: "reconciling" }
    | { phase: "uploading"; uploaded: number; total: number }
    | { phase: "done" }
    | { phase: "error"; message: string };

export interface StremioImportOptions {
    onProgress?: (event: StremioImportProgressEvent) => void;
    signal?: AbortSignal;
    pushToCloud?: boolean;
    addons?: StremioAddonDescriptor[];
    libraryPreviews?: StremioImportPreviewItem[];
    initialWarnings?: string[];
}

const emptyAddonSummary = (): Pick<
    StremioImportSummary,
    "addonsTotal" | "addonsAdded" | "addonsSkipped" | "addonsUnsupported"
> => ({
    addonsTotal: 0,
    addonsAdded: 0,
    addonsSkipped: 0,
    addonsUnsupported: 0,
});

const applyAddonImport = (
    summary: StremioImportSummary,
    addonResult: StremioAddonImportResult,
): StremioImportSummary => ({
    ...summary,
    addonsTotal: addonResult.total,
    addonsAdded: addonResult.added,
    addonsSkipped: addonResult.skipped,
    addonsUnsupported: addonResult.unsupported,
    warnings: [...summary.warnings, ...addonResult.warnings],
});

const runStremioAddonImport = async (
    descriptors: StremioAddonDescriptor[],
    options: StremioImportOptions,
    report: (event: StremioImportProgressEvent) => void,
) => {
    const uniqueDescriptors = (() => {
        const seen = new Set<string>();
        return descriptors.filter((descriptor) => {
            const transportUrl = normalizeStremioTransportUrl(descriptor.transportUrl);
            if (!transportUrl || seen.has(transportUrl)) return false;
            seen.add(transportUrl);
            return true;
        });
    })();

    if (!uniqueDescriptors.length) {
        return {
            total: 0,
            added: 0,
            skipped: 0,
            unsupported: 0,
            warnings: [] as string[],
        };
    }

    report({ phase: "importing_addons" });
    return await importStremioAddons(uniqueDescriptors, {
        getAddons,
        addAddon,
        signal: options.signal,
    });
};

const yieldToBrowser = () => new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => resolve());
    } else {
        setTimeout(resolve, 0);
    }
});

export const importStremioLibrary = async (
    raw: string | unknown | StremioLibraryEntry[],
    options: StremioImportOptions = {},
): Promise<StremioImportSummary> => {
    const { onProgress, signal, pushToCloud = true } = options;
    const report = (event: StremioImportProgressEvent) => {
        if (onProgress) onProgress(event);
    };

    report({ phase: "parsing" });
    const exportAddons = !options.libraryPreviews && !Array.isArray(raw)
        ? parseStremioAddonsFromExport(raw)
        : [];
    const addonDescriptors = [...(options.addons ?? []), ...exportAddons];

    let previews: StremioImportPreviewItem[];
    let warnings: string[];
    let rawCount: number;

    if (options.libraryPreviews) {
        previews = options.libraryPreviews;
        warnings = [...(options.initialWarnings ?? [])];
        rawCount = previews.length;
    } else {
        const parsed = Array.isArray(raw)
            ? parseStremioLibrary(raw)
            : parseStremioExport(raw);
        previews = parsed.items;
        warnings = [...(options.initialWarnings ?? []), ...parsed.warnings];
        rawCount = parsed.rawCount;
    }
    if (signal?.aborted) {
        throw new Error("Import was cancelled.");
    }
    report({ phase: "parsing", rawCount });
    if (previews.length === 0) {
        const addonResult = await runStremioAddonImport(addonDescriptors, options, report);
        const summary: StremioImportSummary = {
            total: 0,
            rawCount,
            added: 0,
            merged: 0,
            skipped: 0,
            movies: 0,
            series: 0,
            watched: 0,
            ...emptyAddonSummary(),
            items: [],
            lastWatched: null,
            poster: null,
            warnings,
        };
        report({ phase: "done" });
        return applyAddonImport(summary, addonResult);
    }

    const shouldPauseCloud = pushToCloud && isCloudBackupEnabled();
    if (shouldPauseCloud) pauseCloudSync();
    publishCloudSyncStatus();

    try {
        const existingLibrary = readLocal<LibraryItem[]>(LOCAL_LIBRARY_KEY, []);
        const total = previews.length;
        let processed = 0;
        let lastYielded = 0;
        const userId = getLocalUserId();
        const nextLibrary: LibraryItem[] = [...existingLibrary];
        const summary: StremioImportSummary = {
            total,
            rawCount,
            added: 0,
            merged: 0,
            skipped: 0,
            movies: previews.filter((item) => item.type === "movie").length,
            series: previews.filter((item) => item.type === "series").length,
            watched: previews.filter((item) => item.watched).length,
            ...emptyAddonSummary(),
            items: [],
            lastWatched: null,
            poster: null,
            warnings,
        };

        for (const preview of previews) {
            if (signal?.aborted) {
                throw new Error("Import was cancelled.");
            }

            processed += 1;
            report({
                phase: "applying",
                processed,
                total,
                current: preview.name,
            });

            const existingIndex = nextLibrary.findIndex((item) => item.imdb_id === preview.imdbId);
            const existing = existingIndex >= 0 ? nextLibrary[existingIndex] : null;
            const lastWatched = preview.lastWatched || new Date().toISOString();

            const baseLastWatched = existing?.last_watched || "";
            const nextLastWatched = (() => {
                if (!baseLastWatched) return lastWatched;
                const a = Date.parse(baseLastWatched) || 0;
                const b = Date.parse(lastWatched) || 0;
                return b > a ? lastWatched : baseLastWatched;
            })();

            const { library, summary: mergeSummary } = mergeStremioImportIntoLibrary(
                existing ? [existing] : [],
                [preview],
            );
            const mergedItem = library.find((item) => item.imdb_id === preview.imdbId);
            const mergedProgress = mergedItem?.progress ?? existing?.progress;
            const completedAt = mergedItem
                ? mergedItem.completed_at
                : existing?.completed_at ?? null;
            const progressChanged = Boolean(mergeSummary.items[0]?.progressChanged);

            let action: "added" | "merged" | "skipped";
            if (!existing) {
                action = "added";
                summary.added += 1;
            } else if (progressChanged || nextLastWatched !== baseLastWatched) {
                action = "merged";
                summary.merged += 1;
            } else {
                action = "skipped";
                summary.skipped += 1;
            }

            const nextItem: LibraryItem = {
                user_id: userId,
                imdb_id: preview.imdbId,
                progress: mergedProgress,
                last_watched: nextLastWatched,
                completed_at: completedAt,
                type: preview.type,
                shown: existing?.shown !== false,
                poster: existing?.poster || preview.poster,
                updated_at: new Date().toISOString(),
            };

            if (existingIndex >= 0) nextLibrary[existingIndex] = nextItem;
            else nextLibrary.push(nextItem);

            summary.items.push({
                ...preview,
                progressChanged,
                mergedProgress,
                newLastWatched: nextLastWatched,
                completedAt,
                action,
            });
            if (!summary.lastWatched || (nextLastWatched && nextLastWatched > summary.lastWatched)) {
                summary.lastWatched = nextLastWatched;
            }
            if (!summary.poster && nextItem.poster) summary.poster = nextItem.poster;

            if (processed - lastYielded >= 25 || processed === total) {
                lastYielded = processed;
                await yieldToBrowser();
            }
        }

        writeLocal(LOCAL_LIBRARY_KEY, nextLibrary);
        for (const preview of previews) {
            markDirty("library", preview.imdbId);
        }
        publishCloudSyncStatus();
        report({ phase: "reconciling" });

        if (pushToCloud && isCloudBackupEnabled()) {
            try {
                const result = await syncCloudBackupNow();
                report({
                    phase: "uploading",
                    uploaded: summary.added + summary.merged,
                    total: summary.added + summary.merged,
                });
                if (!result?.ok && (result as { reason?: string })?.reason !== "paused") {
                    console.warn("Stremio import cloud push did not complete cleanly", result);
                }
            } catch (error) {
                console.warn("Stremio import cloud push failed", error);
            }
        }

        const addonResult = await runStremioAddonImport(addonDescriptors, options, report);
        report({ phase: "done" });
        return applyAddonImport(summary, addonResult);
    } finally {
        if (shouldPauseCloud) resumeCloudSync();
        publishCloudSyncStatus();
    }
};
