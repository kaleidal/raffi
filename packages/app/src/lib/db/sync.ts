import type { CloudSyncState, RemoteState, SyncSection } from "./types";
import {
    clearDirtyMarker,
    getCloudSyncPromise,
    getCloudSyncTimer,
    getRequiredUserId,
    getPendingCloudSyncCounts,
    hasPendingCloudSyncChanges,
    isCloudBackupEnabled,
    isCloudSyncPaused,
    publishCloudSyncStatus,
    readLocalState,
    readSyncState,
    setCloudSyncPromise,
    setCloudSyncTimer,
    clearTombstone,
    cloudSyncStatus,
    mergeRemoteStateIntoLocal,
    setSyncResult,
    canUseCloudFeatures,
    updateSyncState,
    DEFAULT_ADDON,
} from "./state";
import { syncGet, syncPost } from "./raffiSync";
import { get } from "svelte/store";
import { getCachedUser } from "../stores/authStore";

const CACHE_TTL_MS = 15_000;
const REMOTE_RECONCILE_INTERVAL_MS = 30 * 60 * 1000;
const DEFAULT_SYNC_DELAY_MS = 1_200;

let remoteStateCache: { userId: string; data: RemoteState; updatedAt: number } | null = null;
let remoteReconcileTimer: ReturnType<typeof setInterval> | null = null;

type RemoteListWithItems = RemoteState["lists"][number] & {
    list_items?: RemoteState["listItems"];
};

type RemoteStateSnapshot = Partial<Omit<RemoteState, "lists">> & {
    lists?: RemoteListWithItems[];
    list_items?: RemoteState["listItems"];
};

const invalidateRemoteCache = () => {
    remoteStateCache = null;
};

const getRemoteState = async (force = false): Promise<RemoteState> => {
    const userId = getRequiredUserId();
    const now = Date.now();
    if (!force && remoteStateCache && remoteStateCache.userId === userId && now - remoteStateCache.updatedAt < CACHE_TTL_MS) {
        return remoteStateCache.data;
    }
    const snapshot = await syncGet<RemoteStateSnapshot>("/state");
    const rawLists = Array.isArray(snapshot?.lists) ? snapshot.lists : [];
    const lists = rawLists.map(({ list_items, ...list }) => list);
    const listItems = Array.isArray(snapshot?.listItems)
        ? snapshot.listItems
        : Array.isArray(snapshot?.list_items)
            ? snapshot.list_items
            : rawLists.length > 0
                ? rawLists.flatMap((list) =>
                    Array.isArray(list.list_items)
                        ? list.list_items.map((item) => ({ ...item, list_id: item.list_id || list.list_id }))
                        : [],
                )
                : [];
    const normalized = {
        addons: Array.isArray(snapshot?.addons) ? snapshot.addons : [],
        library: Array.isArray(snapshot?.library) ? snapshot.library : [],
        lists,
        listItems,
        userMeta: snapshot?.userMeta || null,
    };
    remoteStateCache = { userId, data: normalized, updatedAt: now };
    return normalized;
};

const persistMergedRemoteState = async (force = false) => {
    const remote = await getRemoteState(force);
    const merged = mergeRemoteStateIntoLocal(remote);
    setSyncResult(null);
    return merged;
};

export const resetRemoteStateCache = () => {
    invalidateRemoteCache();
    publishCloudSyncStatus();
};

export const warmRemoteStateCache = async () => {
    if (!isCloudBackupEnabled()) return null;
    if (getCloudSyncPromise()) return null;
    try {
        return await persistMergedRemoteState(true);
    } catch {
        return null;
    }
};

export const startCloudReconciliationLoop = () => {
    if (!isCloudBackupEnabled()) return;
    if (remoteReconcileTimer) return;
    remoteReconcileTimer = setInterval(() => {
        if (!isCloudBackupEnabled()) return;
        if (isCloudSyncPaused()) return;
        if (getCloudSyncPromise()) return;
        void warmRemoteStateCache();
    }, REMOTE_RECONCILE_INTERVAL_MS);
};

export const stopCloudReconciliationLoop = () => {
    if (!remoteReconcileTimer) return;
    clearInterval(remoteReconcileTimer);
    remoteReconcileTimer = null;
};

export const hydrateLocalBackupFromCloud = async () => {
    if (!isCloudBackupEnabled()) return { ok: false, reason: "disabled" as const };
    try {
        const remote = await getRemoteState(true);
        if (isRemoteStateBootstrapTarget(remote) && hasStateData(readLocalState())) {
            setSyncResult(null);
            return { ok: true as const };
        }
        mergeRemoteStateIntoLocal(remote);
        setSyncResult(null);
        return { ok: true as const };
    } catch (error) {
        setSyncResult(error);
        return { ok: false as const, reason: "offline" as const, error };
    }
};

export const getCloudSyncStatus = () => get(cloudSyncStatus);

export const scheduleCloudBackupSync = (delayMs = DEFAULT_SYNC_DELAY_MS) => {
    if (!isCloudBackupEnabled()) return;
    if (isCloudSyncPaused()) return;
    if (!hasPendingCloudSyncChanges()) return;
    const currentTimer = getCloudSyncTimer();
    if (currentTimer) clearTimeout(currentTimer);
    setCloudSyncTimer(setTimeout(() => {
        setCloudSyncTimer(null);
        if (isCloudSyncPaused()) return;
        const userId = getCachedUser()?.id;
        if (!userId) return;
        if (!hasPendingCloudSyncChanges()) return;
        void syncLocalStateToUser(userId, { forceRemoteRefresh: true });
    }, delayMs));
};

const buildDirtySyncPayload = (local: RemoteState, syncState: CloudSyncState) => {
    const addonsByTransportUrl = new Map(local.addons.map((addon) => [addon.transport_url, addon]));
    const libraryByImdbId = new Map(local.library.map((item) => [item.imdb_id, item]));
    const listsById = new Map(local.lists.map((list) => [list.list_id, list]));
    const listItemsByKey = new Map(local.listItems.map((item) => [`${item.list_id}::${item.imdb_id}`, item]));
    const shouldSyncUserMeta = Boolean(local.userMeta && syncState.dirty.userMeta?.settings);

    return {
        addons: Object.keys(syncState.dirty.addons)
            .map((key) => addonsByTransportUrl.get(key))
            .filter((value): value is NonNullable<typeof value> => Boolean(value)),
        library: Object.keys(syncState.dirty.library)
            .map((key) => libraryByImdbId.get(key))
            .filter((value): value is NonNullable<typeof value> => Boolean(value)),
        lists: Object.keys(syncState.dirty.lists)
            .map((key) => listsById.get(key))
            .filter((value): value is NonNullable<typeof value> => Boolean(value)),
        listItems: Array.from(listItemsByKey.entries())
            .filter(([key, item]) => Boolean(syncState.dirty.listItems[key] || syncState.dirty.lists[item.list_id]))
            .map(([_, item]) => item),
        userMeta: shouldSyncUserMeta ? local.userMeta : null,
        deletes: {
            addons: Object.keys(syncState.tombstones.addons),
            library: Object.keys(syncState.tombstones.library),
            lists: Object.keys(syncState.tombstones.lists),
            listItems: Object.keys(syncState.tombstones.listItems)
                .map((key) => {
                    const [list_id, imdb_id] = key.split("::");
                    if (!list_id || !imdb_id) return null;
                    return { list_id, imdb_id };
                })
                .filter((item): item is { list_id: string; imdb_id: string } => Boolean(item)),
        },
    };
};

const buildFullSyncPayload = (local: RemoteState) => ({
    addons: local.addons,
    library: local.library,
    lists: local.lists,
    listItems: local.listItems,
    userMeta: local.userMeta,
    deletes: {
        addons: [],
        library: [],
        lists: [],
        listItems: [],
    },
});

const stableStringify = (value: unknown) => {
    const normalize = (input: unknown): unknown => {
        if (input === null || input === undefined) return null;
        if (Array.isArray(input)) return input.map(normalize);
        if (typeof input !== "object") return input;
        const entries = Object.entries(input as Record<string, unknown>)
            .filter(([_, itemValue]) => itemValue !== undefined)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([itemKey, itemValue]) => [itemKey, normalize(itemValue)] as const);
        return Object.fromEntries(entries);
    };

    return JSON.stringify(normalize(value));
};

const areRecordsEqual = (left: unknown, right: unknown) =>
    stableStringify(left) === stableStringify(right);

const buildMismatchSyncPayload = (local: RemoteState, remote: RemoteState) => {
    const remoteAddons = new Map(remote.addons.map((item) => [item.transport_url, item]));
    for (const item of remote.addons) {
        remoteAddons.set(item.transport_url, item);
    }

    const remoteLibrary = new Map(remote.library.map((item) => [item.imdb_id, item]));
    for (const item of remote.library) {
        remoteLibrary.set(item.imdb_id, item);
    }

    const remoteLists = new Map(remote.lists.map((item) => [item.list_id, item]));
    for (const item of remote.lists) {
        remoteLists.set(item.list_id, item);
    }

    const remoteListItems = new Map(remote.listItems.map((item) => [`${item.list_id}::${item.imdb_id}`, item]));
    for (const item of remote.listItems) {
        remoteListItems.set(`${item.list_id}::${item.imdb_id}`, item);
    }

    const remoteAddonMismatch: RemoteState["addons"] = [];
    const remoteLibraryMismatch: RemoteState["library"] = [];
    const remoteListMismatch: RemoteState["lists"] = [];
    const remoteListItemMismatch: RemoteState["listItems"] = [];

    for (const item of local.addons) {
        const remoteItem = remoteAddons.get(item.transport_url);
        if (!remoteItem) {
            remoteAddonMismatch.push(item);
            continue;
        }
        const hasAddonDiff = remoteItem.addon_id !== item.addon_id
            || remoteItem.added_at !== item.added_at
            || remoteItem.position !== item.position
            || !areRecordsEqual(remoteItem.manifest, item.manifest)
            || !areRecordsEqual(remoteItem.flags, item.flags);

        if (hasAddonDiff) {
            remoteAddonMismatch.push(item);
        }
    }

    for (const item of local.library) {
        const remoteItem = remoteLibrary.get(item.imdb_id);
        if (!remoteItem) {
            remoteLibraryMismatch.push(item);
            continue;
        }
        const hasLibraryDiff = remoteItem.last_watched !== item.last_watched
            || remoteItem.type !== item.type
            || remoteItem.shown !== item.shown
            || remoteItem.poster !== item.poster
            || remoteItem.completed_at !== item.completed_at
            || !areRecordsEqual(remoteItem.progress, item.progress);

        if (hasLibraryDiff) {
            remoteLibraryMismatch.push(item);
        }
    }

    for (const item of local.lists) {
        const remoteItem = remoteLists.get(item.list_id);
        if (!remoteItem) {
            remoteListMismatch.push(item);
            continue;
        }
        const hasListDiff = remoteItem.created_at !== item.created_at
            || remoteItem.name !== item.name
            || remoteItem.position !== item.position;

        if (hasListDiff) {
            remoteListMismatch.push(item);
        }
    }

    for (const item of local.listItems) {
        const remoteItem = remoteListItems.get(`${item.list_id}::${item.imdb_id}`);
        if (!remoteItem) {
            remoteListItemMismatch.push(item);
            continue;
        }
        const hasListItemDiff = remoteItem.position !== item.position
            || remoteItem.type !== item.type
            || remoteItem.poster !== item.poster;

        if (hasListItemDiff) {
            remoteListItemMismatch.push(item);
        }
    }

    const localMeta = local.userMeta;
    const remoteMeta = remote.userMeta;
    const shouldSyncUserMeta = localMeta && (
        !remoteMeta
        || remoteMeta.updated_at !== localMeta.updated_at
        || stableStringify(remoteMeta.settings) !== stableStringify(localMeta.settings)
    );

    return {
        addons: remoteAddonMismatch,
        library: remoteLibraryMismatch,
        lists: remoteListMismatch,
        listItems: remoteListItemMismatch,
        userMeta: shouldSyncUserMeta ? localMeta : null,
        deletes: {
            addons: [],
            library: [],
            lists: [],
            listItems: [],
        },
    };
};

const isRemoteStateEmpty = (state: RemoteState) =>
    state.addons.length === 0
    && state.library.length === 0
    && state.lists.length === 0
    && state.listItems.length === 0
    && !state.userMeta;

const isRemoteStateBootstrapTarget = (state: RemoteState) =>
    isRemoteStateEmpty(state)
    || (
        state.addons.length === 1
        && state.addons[0]?.transport_url === DEFAULT_ADDON.transportUrl
        && state.library.length === 0
        && state.lists.length === 0
        && state.listItems.length === 0
        && !state.userMeta
    );

const hasStateData = (state: RemoteState) =>
    state.addons.length > 0
    || state.library.length > 0
    || state.lists.length > 0
    || state.listItems.length > 0
    || Boolean(state.userMeta);

const hasSyncPayloadChanges = (payload: ReturnType<typeof buildDirtySyncPayload> | ReturnType<typeof buildFullSyncPayload>) =>
    payload.addons.length
    + payload.library.length
    + payload.lists.length
    + payload.listItems.length
    + (payload.userMeta ? 1 : 0)
    + payload.deletes.addons.length
    + payload.deletes.library.length
    + payload.deletes.lists.length
    + payload.deletes.listItems.length > 0;

const toMutationPayload = (payload: ReturnType<typeof buildDirtySyncPayload> | ReturnType<typeof buildFullSyncPayload>) => {
    const mutationPayload: Record<string, any> = {
        addons: payload.addons.map((addon) => ({ transport_url: addon.transport_url, manifest: addon.manifest, flags: addon.flags, addon_id: addon.addon_id, added_at: addon.added_at, position: addon.position })),
        library: payload.library.map((item) => ({ imdb_id: item.imdb_id, progress: item.progress, last_watched: item.last_watched, completed_at: item.completed_at, type: item.type, shown: item.shown, poster: item.poster })),
        lists: payload.lists.map((list) => ({ list_id: list.list_id, name: list.name, position: list.position, created_at: list.created_at })),
        listItems: payload.listItems.map((item) => ({ list_id: item.list_id, imdb_id: item.imdb_id, position: item.position, type: item.type, poster: item.poster })),
        deletes: payload.deletes,
    };
    if (payload.userMeta) {
        mutationPayload.userMeta = {
            settings: payload.userMeta.settings,
            updated_at: payload.userMeta.updated_at,
        };
    }
    return mutationPayload;
};

const clearSyncedSnapshot = (snapshot: CloudSyncState) => {
    const sections: SyncSection[] = ["addons", "library", "lists", "listItems", "userMeta"];
    updateSyncState((state) => {
        const next = {
            ...state,
            dirty: {
                addons: { ...state.dirty.addons },
                library: { ...state.dirty.library },
                lists: { ...state.dirty.lists },
                listItems: { ...state.dirty.listItems },
                userMeta: { ...state.dirty.userMeta },
            },
            tombstones: {
                addons: { ...state.tombstones.addons },
                library: { ...state.tombstones.library },
                lists: { ...state.tombstones.lists },
                listItems: { ...state.tombstones.listItems },
                userMeta: { ...state.tombstones.userMeta },
            },
        };

        for (const section of sections) {
            for (const [key, timestamp] of Object.entries(snapshot.dirty[section])) {
                if (next.dirty[section][key] === timestamp) {
                    delete next.dirty[section][key];
                }
            }
            for (const [key, timestamp] of Object.entries(snapshot.tombstones[section])) {
                if (next.tombstones[section][key] === timestamp) {
                    delete next.tombstones[section][key];
                }
            }
        }

        return next;
    });
};

export const syncLocalStateToUser = async (userId: string, options?: { forceRemoteRefresh?: boolean }) => {
    if (!userId || !isCloudBackupEnabled()) return { ok: false };
    if (isCloudSyncPaused()) return { ok: false, paused: true as const };
    const active = getCloudSyncPromise();
    if (active) return active;
    const pending = getPendingCloudSyncCounts();

    const promise = (async () => {
        try {
            const remote = await getRemoteState(options?.forceRemoteRefresh ?? true);
            const localBeforeMerge = readLocalState();
            const syncStateBeforeMerge = readSyncState();
            const needsBootstrap = isRemoteStateBootstrapTarget(remote) && hasStateData(localBeforeMerge);

            if (!needsBootstrap) {
                mergeRemoteStateIntoLocal(remote);
            }

            const local = needsBootstrap ? localBeforeMerge : readLocalState();
            const syncState = needsBootstrap ? syncStateBeforeMerge : readSyncState();
            const payload = needsBootstrap
                ? buildFullSyncPayload(local)
                : pending.uploads + pending.deletes === 0
                    ? buildMismatchSyncPayload(local, remote)
                    : buildDirtySyncPayload(local, syncState);

            if (!hasSyncPayloadChanges(payload)) {
                publishCloudSyncStatus();
                return { ok: true, skipped: true as const, reason: "clean" as const };
            }

            await syncPost("/sync", toMutationPayload(payload));

            clearSyncedSnapshot(syncState);
            invalidateRemoteCache();
            setSyncResult(null);
            return { ok: true };
        } catch (error) {
            setSyncResult(error);
            return { ok: false, error };
        } finally {
            setCloudSyncPromise(null);
            publishCloudSyncStatus();
        }
    })();

    setCloudSyncPromise(promise);
    return promise;
};

export const syncUserStateToLocal = async (userId: string) => {
    if (!userId) return;
    try {
        await persistMergedRemoteState(true);
    } catch {
        return;
    }
};

export const syncCloudBackupNow = async () => {
    const userId = getCachedUser()?.id;
    if (!userId) {
        publishCloudSyncStatus();
        return { ok: false as const, reason: "disabled" as const };
    }
    if (isCloudSyncPaused()) {
        publishCloudSyncStatus();
        return { ok: false as const, reason: "paused" as const };
    }
    return syncLocalStateToUser(userId, { forceRemoteRefresh: true });
};

export const flushPendingLibraryProgress = async (_imdbId?: string) => {
    if (!isCloudBackupEnabled()) return { flushed: 0, pending: 0 };
    if (!hasPendingCloudSyncChanges()) return { flushed: 0, pending: 0 };
    const result = await syncLocalStateToUser(getRequiredUserId());
    const pending = getPendingCloudSyncCounts();
    return { flushed: result.ok && !("skipped" in result && result.skipped) ? 1 : 0, pending: pending.uploads + pending.deletes };
};

export const cloudFeaturesAvailable = () => canUseCloudFeatures();
