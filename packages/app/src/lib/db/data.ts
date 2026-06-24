import type { Addon, LibraryItem, List, ListItem, UserMeta } from "./types";
import {
    DEFAULT_ADDON,
    LOCAL_ADDONS_KEY,
    LOCAL_LIBRARY_KEY,
    LOCAL_LIST_ITEMS_KEY,
    LOCAL_LISTS_KEY,
    LOCAL_USER_META_KEY,
    getLocalUserId,
    isCloudBackupEnabled,
    listItemKey,
    markDeleted,
    markDirty,
    pauseCloudSync,
    readLocal,
    readLocalState,
    resumeCloudSync,
    upsertLibraryItem,
    writeLocal,
    publishCloudSyncStatus,
} from "./state";
import { syncPost } from "./raffiSync";
import { scheduleCloudBackupSync, syncCloudBackupNow } from "./sync";
import {
    mergeStremioImportIntoLibrary,
    parseStremioExport,
    parseStremioLibrary,
    type StremioImportSummary,
    type StremioLibraryEntry,
} from "../import/stremioImport";
import {
    fetchStremioLibrary,
    fetchStremioLibraryWithLogin,
    logoutStremio,
    StremioApiClientError,
} from "../import/stremioApi";
import {
    clearStremioConnection,
    getStremioConnection,
    getStremioConnectionStatus,
    saveStremioConnection,
    type StremioConnectionStatus,
} from "../import/stremioConnection";

export { hasLocalState } from "./state";

const sortAddons = (addons: Addon[]) =>
    [...addons].sort((left, right) => {
        const leftPosition = left.position ?? Number.MAX_SAFE_INTEGER;
        const rightPosition = right.position ?? Number.MAX_SAFE_INTEGER;
        if (leftPosition !== rightPosition) {
            return leftPosition - rightPosition;
        }
        return (left.added_at || "").localeCompare(right.added_at || "");
    });

const normalizeAddons = (addons: Addon[]) => {
    const sorted = sortAddons(addons);
    let changed = false;
    const normalized = sorted.map((addon, index) => {
        const position = index + 1;
        if (addon.position === position) return addon;
        changed = true;
        return { ...addon, position };
    });
    return { normalized, changed };
};

export const ensureDefaultAddonsForUser = async (userId: string) => {
    await ensureDefaultAddonsForLocal();
    if (!userId) return;
    try {
        await syncPost("/addons/default", { addon: DEFAULT_ADDON });
    } catch (error) {
        console.warn("Failed to seed default addons", error);
    }
};

export const ensureDefaultAddonsForLocal = async () => {
    const addons = readLocal<Addon[]>(LOCAL_ADDONS_KEY, []);
    if (addons.some((addon) => addon.transport_url === DEFAULT_ADDON.transportUrl)) return;
    writeLocal(LOCAL_ADDONS_KEY, [
        ...addons,
        {
            user_id: getLocalUserId(),
            added_at: new Date().toISOString(),
            transport_url: DEFAULT_ADDON.transportUrl,
            manifest: DEFAULT_ADDON.manifest,
            flags: { protected: false, official: false },
            addon_id: crypto.randomUUID(),
            position: addons.length + 1,
        },
    ]);
    markDirty("addons", DEFAULT_ADDON.transportUrl);
    scheduleCloudBackupSync();
    publishCloudSyncStatus();
};

export const getAddons = async () => {
    const current = readLocal<Addon[]>(LOCAL_ADDONS_KEY, []);
    const { normalized, changed } = normalizeAddons(current);
    if (changed) {
        writeLocal(LOCAL_ADDONS_KEY, normalized);
    }
    return normalized;
};

export const addAddon = async (addon: Omit<Addon, "user_id" | "added_at">) => {
    const current = await getAddons();
    const existing = current.find((item) => item.transport_url === addon.transport_url);
    if (existing) return existing;
    const maxPosition = current.reduce(
        (highest, item) => Math.max(highest, item.position ?? 0),
        0,
    );
    const next = {
        ...addon,
        user_id: getLocalUserId(),
        added_at: new Date().toISOString(),
        addon_id: addon.addon_id || crypto.randomUUID(),
        position: addon.position ?? maxPosition + 1,
    } as Addon;
    writeLocal(LOCAL_ADDONS_KEY, [...current, next]);
    markDirty("addons", next.transport_url);
    scheduleCloudBackupSync();
    return next;
};

export const reorderAddons = async (transportUrlsInOrder: string[]) => {
    const current = await getAddons();
    if (current.length <= 1) return current;

    const currentByUrl = new Map(current.map((addon) => [addon.transport_url, addon]));
    const ordered: Addon[] = [];

    for (const transportUrl of transportUrlsInOrder) {
        const addon = currentByUrl.get(transportUrl);
        if (!addon) continue;
        ordered.push(addon);
        currentByUrl.delete(transportUrl);
    }

    for (const addon of current) {
        if (currentByUrl.has(addon.transport_url)) {
            ordered.push(addon);
            currentByUrl.delete(addon.transport_url);
        }
    }

    const next = ordered.map((addon, index) => ({ ...addon, position: index + 1 }));
    writeLocal(LOCAL_ADDONS_KEY, next);
    for (const addon of next) {
        markDirty("addons", addon.transport_url);
    }
    scheduleCloudBackupSync();
    return next;
};

export const removeAddon = async (transport_url: string) => {
    writeLocal(LOCAL_ADDONS_KEY, readLocal<Addon[]>(LOCAL_ADDONS_KEY, []).filter((item) => item.transport_url !== transport_url));
    markDeleted("addons", transport_url);
    scheduleCloudBackupSync();
};

export const getUserMeta = async (): Promise<UserMeta> => {
    const existing = readLocal<UserMeta | null>(LOCAL_USER_META_KEY, null);
    return existing ?? {
        user_id: getLocalUserId(),
        settings: {},
        updated_at: new Date().toISOString(),
    };
};

export const updateUserSettings = async (settings: Record<string, any>) => {
    const current = await getUserMeta();
    const next: UserMeta = {
        ...current,
        user_id: getLocalUserId(),
        settings: {
            ...(current.settings || {}),
            ...settings,
        },
        updated_at: new Date().toISOString(),
    };
    writeLocal(LOCAL_USER_META_KEY, next);
    markDirty("userMeta", "settings");
    scheduleCloudBackupSync();
    publishCloudSyncStatus();
    return next;
};

export const getLibrary = async (limit = 100, offset = 0) => {
    const items = readLocal<LibraryItem[]>(LOCAL_LIBRARY_KEY, []);
    return [...items].sort((a, b) => (b.last_watched || "").localeCompare(a.last_watched || "")).slice(offset, offset + limit);
};

export const getLibraryItem = async (imdb_id: string) => readLocal<LibraryItem[]>(LOCAL_LIBRARY_KEY, []).find((item) => item.imdb_id === imdb_id) ?? null;

export const hideFromContinueWatching = async (imdb_id: string) => {
    writeLocal(LOCAL_LIBRARY_KEY, readLocal<LibraryItem[]>(LOCAL_LIBRARY_KEY, []).map((item) => item.imdb_id === imdb_id ? { ...item, shown: false } : item));
    markDirty("library", imdb_id);
    scheduleCloudBackupSync();
};

export const forgetProgress = async (imdb_id: string) => {
    writeLocal(LOCAL_LIBRARY_KEY, readLocal<LibraryItem[]>(LOCAL_LIBRARY_KEY, []).filter((item) => item.imdb_id !== imdb_id));
    markDeleted("library", imdb_id);
    scheduleCloudBackupSync();
};

export const updateLibraryProgress = async (
	imdb_id: string,
	progress: any,
	type: string,
	completed?: boolean,
	poster?: string,
	options?: { syncDelayMs?: number },
) => {
    const items = readLocal<LibraryItem[]>(LOCAL_LIBRARY_KEY, []);
    const { updated, next } = upsertLibraryItem(items, imdb_id, progress, type, completed, poster);
    writeLocal(LOCAL_LIBRARY_KEY, updated);
    markDirty("library", imdb_id);
    scheduleCloudBackupSync(options?.syncDelayMs);
    return next;
};

export const updateLibraryPoster = async (imdb_id: string, poster: string) => {
    writeLocal(LOCAL_LIBRARY_KEY, readLocal<LibraryItem[]>(LOCAL_LIBRARY_KEY, []).map((item) => item.imdb_id === imdb_id ? { ...item, poster } : item));
    markDirty("library", imdb_id);
    scheduleCloudBackupSync();
};

export const getLists = async () => [...readLocal<List[]>(LOCAL_LISTS_KEY, [])].sort((a, b) => a.position - b.position);

export const getListsWithItems = async () => {
    const data = readLocalState();
    const itemsByListId: Record<string, ListItem[]> = {};
    data.listItems.forEach((item) => {
        if (!itemsByListId[item.list_id]) itemsByListId[item.list_id] = [];
        itemsByListId[item.list_id].push(item);
    });
    return [...data.lists].sort((a, b) => a.position - b.position).map((list) => ({
        ...list,
        list_items: [...(itemsByListId[list.list_id] || [])].sort((a, b) => a.position - b.position),
    }));
};

export const getListMembershipByImdb = async (imdbId: string) => new Set(readLocal<ListItem[]>(LOCAL_LIST_ITEMS_KEY, []).filter((item) => item.imdb_id === imdbId).map((item) => item.list_id));

export const createList = async (name: string) => {
    const lists = readLocal<List[]>(LOCAL_LISTS_KEY, []);
    const next: List = {
        list_id: crypto.randomUUID(),
        user_id: getLocalUserId(),
        created_at: new Date().toISOString(),
        name,
        position: lists.length ? Math.max(...lists.map((item) => item.position)) + 1 : 1,
    };
    writeLocal(LOCAL_LISTS_KEY, [...lists, next]);
    markDirty("lists", next.list_id);
    scheduleCloudBackupSync();
    return next;
};

export const updateList = async (list_id: string, updates: Partial<List>) => {
    writeLocal(LOCAL_LISTS_KEY, readLocal<List[]>(LOCAL_LISTS_KEY, []).map((list) => list.list_id === list_id ? { ...list, ...updates } : list));
    markDirty("lists", list_id);
    scheduleCloudBackupSync();
};

export const deleteList = async (list_id: string) => {
    const items = readLocal<ListItem[]>(LOCAL_LIST_ITEMS_KEY, []);
    const removedItemKeys = items.filter((item) => item.list_id === list_id).map((item) => listItemKey(item.list_id, item.imdb_id));
    writeLocal(LOCAL_LISTS_KEY, readLocal<List[]>(LOCAL_LISTS_KEY, []).filter((list) => list.list_id !== list_id));
    writeLocal(LOCAL_LIST_ITEMS_KEY, items.filter((item) => item.list_id !== list_id));
    markDeleted("lists", list_id);
    for (const key of removedItemKeys) markDeleted("listItems", key);
    scheduleCloudBackupSync();
};

export const addToList = async (list_id: string, imdb_id: string, position: number, type: string, poster?: string) => {
    const items = readLocal<ListItem[]>(LOCAL_LIST_ITEMS_KEY, []);
    const index = items.findIndex((item) => item.list_id === list_id && item.imdb_id === imdb_id);
    const next: ListItem = { list_id, imdb_id, position, type, poster };
    const updated = [...items];
    if (index >= 0) updated[index] = { ...items[index], ...next };
    else updated.push(next);
    writeLocal(LOCAL_LIST_ITEMS_KEY, updated);
    markDirty("listItems", listItemKey(list_id, imdb_id));
    scheduleCloudBackupSync();
};

export const removeFromList = async (list_id: string, imdb_id: string) => {
    writeLocal(LOCAL_LIST_ITEMS_KEY, readLocal<ListItem[]>(LOCAL_LIST_ITEMS_KEY, []).filter((item) => !(item.list_id === list_id && item.imdb_id === imdb_id)));
    markDeleted("listItems", listItemKey(list_id, imdb_id));
    scheduleCloudBackupSync();
};

export const getListItems = async (list_id: string) => readLocal<ListItem[]>(LOCAL_LIST_ITEMS_KEY, []).filter((item) => item.list_id === list_id).sort((a, b) => a.position - b.position);

export const updateListItemPosition = async (list_id: string, imdb_id: string, position: number) => {
    writeLocal(LOCAL_LIST_ITEMS_KEY, readLocal<ListItem[]>(LOCAL_LIST_ITEMS_KEY, []).map((item) => item.list_id === list_id && item.imdb_id === imdb_id ? { ...item, position } : item));
    markDirty("listItems", listItemKey(list_id, imdb_id));
    scheduleCloudBackupSync();
};

export const updateListItemPoster = async (list_id: string, imdb_id: string, poster: string) => {
    writeLocal(LOCAL_LIST_ITEMS_KEY, readLocal<ListItem[]>(LOCAL_LIST_ITEMS_KEY, []).map((item) => item.list_id === list_id && item.imdb_id === imdb_id ? { ...item, poster } : item));
    markDirty("listItems", listItemKey(list_id, imdb_id));
    scheduleCloudBackupSync();
};

export type StremioImportProgressEvent =
    | { phase: "fetching" }
    | { phase: "parsing"; rawCount?: number }
    | { phase: "applying"; processed: number; total: number; current?: string }
    | { phase: "reconciling" }
    | { phase: "uploading"; uploaded: number; total: number }
    | { phase: "done" }
    | { phase: "error"; message: string };

export interface StremioImportOptions {
    onProgress?: (event: StremioImportProgressEvent) => void;
    signal?: AbortSignal;
    pushToCloud?: boolean;
}

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
    const parsed = Array.isArray(raw)
        ? parseStremioLibrary(raw)
        : parseStremioExport(raw);
    const { items: previews, warnings, rawCount } = parsed;
    if (signal?.aborted) {
        throw new Error("Import was cancelled.");
    }
    report({ phase: "parsing", rawCount });
    if (previews.length === 0) {
        const summary: StremioImportSummary = {
            total: 0,
            rawCount,
            added: 0,
            merged: 0,
            skipped: 0,
            movies: 0,
            series: 0,
            watched: 0,
            items: [],
            lastWatched: null,
            poster: null,
            warnings,
        };
        report({ phase: "done" });
        return summary;
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
            const completedAt = mergedItem?.completed_at ?? existing?.completed_at ?? null;
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

        report({ phase: "done" });
        return summary;
    } finally {
        if (shouldPauseCloud) resumeCloudSync();
        publishCloudSyncStatus();
    }
};

export { getStremioConnectionStatus, type StremioConnectionStatus };

export const getStremioStatus = (): StremioConnectionStatus => getStremioConnectionStatus();

export const disconnectStremio = async () => {
    const connection = getStremioConnection();
    if (connection?.authKey) {
        await logoutStremio(connection.authKey);
    }
    clearStremioConnection();
};

export const importStremioFromAccount = async (
    email: string,
    password: string,
    options: StremioImportOptions & { keepConnected?: boolean } = {},
): Promise<StremioImportSummary> => {
    const { keepConnected = false, ...importOptions } = options;
    const onProgress = importOptions.onProgress;
    const report = (event: StremioImportProgressEvent) => {
        if (onProgress) onProgress(event);
    };

    report({ phase: "fetching" });
    try {
        const { authKey, email: resolvedEmail, library } = await fetchStremioLibraryWithLogin(email, password);
        if (importOptions.signal?.aborted) {
            throw new Error("Import was cancelled.");
        }

        if (keepConnected) {
            saveStremioConnection({ authKey, email: resolvedEmail });
        }

        return await importStremioLibrary(library, importOptions);
    } catch (error) {
        if (error instanceof StremioApiClientError) {
            if (error.apiError?.wrongPass) {
                throw new Error("Wrong email or password.");
            }
            throw new Error(error.message);
        }
        throw error;
    }
};

export const syncStremioLibrary = async (
    options: StremioImportOptions = {},
): Promise<StremioImportSummary> => {
    const connection = getStremioConnection();
    if (!connection) {
        throw new Error("Stremio is not connected. Sign in from Import from Stremio first.");
    }

    const onProgress = options.onProgress;
    const report = (event: StremioImportProgressEvent) => {
        if (onProgress) onProgress(event);
    };

    report({ phase: "fetching" });
    try {
        const library = await fetchStremioLibrary(connection.authKey);
        if (options.signal?.aborted) {
            throw new Error("Import was cancelled.");
        }
        return await importStremioLibrary(library, options);
    } catch (error) {
        if (error instanceof StremioApiClientError) {
            clearStremioConnection();
            throw new Error("Stremio session expired. Sign in again to keep syncing.");
        }
        throw error;
    }
};

