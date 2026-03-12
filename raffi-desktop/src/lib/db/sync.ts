import { convexMutation, convexQuery } from "./convex";
import type { RemoteState } from "./types";
import {
    getCloudSyncPromise,
    getCloudSyncTimer,
    getRequiredUserId,
    getPendingCloudSyncCounts,
    hasPendingCloudSyncChanges,
    isCloudBackupEnabled,
    publishCloudSyncStatus,
    readLocalState,
    readSyncState,
    setCloudSyncPromise,
    setCloudSyncTimer,
    clearDirtyMarkers,
    clearTombstone,
    cloudSyncStatus,
    mergeRemoteStateIntoLocal,
    setSyncResult,
    canUseCloudFeatures,
} from "./state";
import { get } from "svelte/store";
import { getCachedUser } from "../stores/authStore";

const CACHE_TTL_MS = 15_000;
const REMOTE_RECONCILE_INTERVAL_MS = 30 * 60 * 1000;

let remoteStateCache: { userId: string; data: RemoteState; updatedAt: number } | null = null;
let remoteReconcileTimer: ReturnType<typeof setInterval> | null = null;

const invalidateRemoteCache = () => {
    remoteStateCache = null;
};

const getRemoteState = async (force = false): Promise<RemoteState> => {
    const userId = getRequiredUserId();
    const now = Date.now();
    if (!force && remoteStateCache && remoteStateCache.userId === userId && now - remoteStateCache.updatedAt < CACHE_TTL_MS) {
        return remoteStateCache.data;
    }
    const snapshot = await convexQuery<RemoteState>("raffi:getState", {});
    const normalized = {
        addons: Array.isArray(snapshot?.addons) ? snapshot.addons : [],
        library: Array.isArray(snapshot?.library) ? snapshot.library : [],
        lists: Array.isArray(snapshot?.lists) ? snapshot.lists : [],
        listItems: Array.isArray(snapshot?.listItems) ? snapshot.listItems : [],
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
        await persistMergedRemoteState(true);
        return { ok: true as const };
    } catch (error) {
        setSyncResult(error);
        return { ok: false as const, reason: "offline" as const, error };
    }
};

export const getCloudSyncStatus = () => get(cloudSyncStatus);

export const scheduleCloudBackupSync = (delayMs = 1200) => {
    if (!isCloudBackupEnabled()) return;
    if (!hasPendingCloudSyncChanges()) return;
    const currentTimer = getCloudSyncTimer();
    if (currentTimer) clearTimeout(currentTimer);
    setCloudSyncTimer(setTimeout(() => {
        setCloudSyncTimer(null);
        const userId = getCachedUser()?.id;
        if (!userId) return;
        if (!hasPendingCloudSyncChanges()) return;
        void syncLocalStateToUser(userId);
    }, delayMs));
};

export const syncLocalStateToUser = async (userId: string) => {
    if (!userId || !isCloudBackupEnabled()) return { ok: false };
    const active = getCloudSyncPromise();
    if (active) return active;
    const pending = getPendingCloudSyncCounts();
    if (pending.uploads + pending.deletes === 0) {
        publishCloudSyncStatus();
        return { ok: true, skipped: true as const, reason: "clean" as const };
    }

    const promise = (async () => {
        try {
            await persistMergedRemoteState(true);
            const local = readLocalState();
            const syncState = readSyncState();
            await convexMutation("raffi:applySyncState", {
                addons: local.addons.map((addon) => ({ transport_url: addon.transport_url, manifest: addon.manifest, flags: addon.flags, addon_id: addon.addon_id, added_at: addon.added_at })),
                library: local.library.map((item) => ({ imdb_id: item.imdb_id, progress: item.progress, last_watched: item.last_watched, completed_at: item.completed_at, type: item.type, shown: item.shown, poster: item.poster })),
                lists: local.lists.map((list) => ({ list_id: list.list_id, name: list.name, position: list.position, created_at: list.created_at })),
                listItems: local.listItems.map((item) => ({ list_id: item.list_id, imdb_id: item.imdb_id, position: item.position, type: item.type, poster: item.poster })),
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
            });

            clearDirtyMarkers();
            for (const transportUrl of Object.keys(syncState.tombstones.addons)) {
                clearTombstone("addons", transportUrl);
            }
            for (const imdbId of Object.keys(syncState.tombstones.library)) {
                clearTombstone("library", imdbId);
            }
            for (const listId of Object.keys(syncState.tombstones.lists)) {
                clearTombstone("lists", listId);
            }
            for (const key of Object.keys(syncState.tombstones.listItems)) {
                clearTombstone("listItems", key);
            }
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
    return syncLocalStateToUser(userId);
};

export const flushPendingLibraryProgress = async (_imdbId?: string) => {
    if (!isCloudBackupEnabled()) return { flushed: 0, pending: 0 };
    if (!hasPendingCloudSyncChanges()) return { flushed: 0, pending: 0 };
    const result = await syncLocalStateToUser(getRequiredUserId());
    const pending = getPendingCloudSyncCounts();
    return { flushed: result.ok && !("skipped" in result && result.skipped) ? 1 : 0, pending: pending.uploads + pending.deletes };
};

export const cloudFeaturesAvailable = () => canUseCloudFeatures();