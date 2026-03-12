import { getCachedUser, localMode } from "../stores/authStore";
import { get, writable } from "svelte/store";
import type {
    Addon,
    CloudSyncState,
    CloudSyncStatus,
    LibraryItem,
    List,
    ListItem,
    RemoteState,
    SyncSection,
    SyncStateSectionMap,
    TraktStatus,
} from "./types";

export const LOCAL_USER_ID = "local-user";
export const LOCAL_ADDONS_KEY = "local:addons";
export const LOCAL_LIBRARY_KEY = "local:library";
export const LOCAL_LISTS_KEY = "local:lists";
export const LOCAL_LIST_ITEMS_KEY = "local:list_items";
export const LOCAL_CLOUD_SYNC_STATE_KEY = "local:cloud_sync_state";
export const LOCAL_MODE_KEY = "local_mode_enabled";

export const DEFAULT_ADDON = {
    transportUrl: "https://opensubtitles-v3.strem.io",
    manifest: {
        id: "org.stremio.opensubtitlesv3",
        logo: "http://www.strem.io/images/addons/opensubtitles-logo.png",
        name: "OpenSubtitles v3",
        types: ["movie", "series"],
        version: "1.0.0",
        catalogs: [],
        resources: ["subtitles"],
        idPrefixes: ["tt"],
        description: "OpenSubtitles v3 Addon for Stremio",
    },
};

export const DEFAULT_TRAKT_STATUS: TraktStatus = {
    configured: false,
    clientId: null,
    redirectUri: "raffi://trakt/callback",
    authorizeUrl: "https://trakt.tv/oauth/authorize",
    connected: false,
    username: null,
    slug: null,
    scope: null,
    updatedAt: null,
    expiresAt: null,
};

let cloudSyncPromise: Promise<{ ok: boolean; error?: unknown }> | null = null;
let cloudSyncTimer: ReturnType<typeof setTimeout> | null = null;

export const isLocalModeActive = () => get(localMode) && !getCachedUser();
export const isCloudBackupEnabled = () => Boolean(getCachedUser()?.id);
export const getLocalUserId = () => getCachedUser()?.id || LOCAL_USER_ID;
export const getRequiredUserId = () => {
    const user = getCachedUser();
    if (!user?.id) throw new Error("Not authenticated");
    return user.id;
};

const countKeys = (value: Record<string, number>) => Object.keys(value).length;

const countSyncSectionMap = (map: Partial<SyncStateSectionMap> | undefined) =>
    countKeys(map?.addons || {})
    + countKeys(map?.library || {})
    + countKeys(map?.lists || {})
    + countKeys(map?.listItems || {});

export const readLocal = <T>(key: string, fallback: T): T => {
    if (typeof window === "undefined") return fallback;
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
};

export const writeLocal = (key: string, value: any) => {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // ignore
    }
};

export const removeLocal = (key: string) => {
    if (typeof window === "undefined") return;
    try {
        localStorage.removeItem(key);
    } catch {
        // ignore
    }
};

export const hasPersistedLocalState = () => {
    const addons = readLocal<Addon[]>(LOCAL_ADDONS_KEY, []);
    const library = readLocal<LibraryItem[]>(LOCAL_LIBRARY_KEY, []);
    const lists = readLocal<List[]>(LOCAL_LISTS_KEY, []);
    const listItems = readLocal<ListItem[]>(LOCAL_LIST_ITEMS_KEY, []);
    return addons.length > 0 || library.length > 0 || lists.length > 0 || listItems.length > 0;
};

const createEmptySyncSectionMap = (): SyncStateSectionMap => ({
    addons: {},
    library: {},
    lists: {},
    listItems: {},
});

const createDefaultSyncState = (): CloudSyncState => ({
    dirty: createEmptySyncSectionMap(),
    tombstones: createEmptySyncSectionMap(),
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastError: null,
    reachability: "unknown",
});

export const readSyncState = (): CloudSyncState => {
    const raw = readLocal<Partial<CloudSyncState>>(LOCAL_CLOUD_SYNC_STATE_KEY, {});
    const base = createDefaultSyncState();
    return {
        dirty: {
            addons: { ...(raw.dirty?.addons || {}) },
            library: { ...(raw.dirty?.library || {}) },
            lists: { ...(raw.dirty?.lists || {}) },
            listItems: { ...(raw.dirty?.listItems || {}) },
        },
        tombstones: {
            addons: { ...(raw.tombstones?.addons || {}) },
            library: { ...(raw.tombstones?.library || {}) },
            lists: { ...(raw.tombstones?.lists || {}) },
            listItems: { ...(raw.tombstones?.listItems || {}) },
        },
        lastAttemptAt: raw.lastAttemptAt ?? base.lastAttemptAt,
        lastSuccessAt: raw.lastSuccessAt ?? base.lastSuccessAt,
        lastError: raw.lastError ?? base.lastError,
        reachability: raw.reachability ?? base.reachability,
    };
};

const createCloudSyncStatusSnapshot = (): CloudSyncStatus => {
    const syncState = readLocal<Partial<CloudSyncState>>(LOCAL_CLOUD_SYNC_STATE_KEY, {});
    const dirty = syncState.dirty || {};
    const tombstones = syncState.tombstones || {};
    const backupEnabled = isCloudBackupEnabled();
    const reachability = (syncState.reachability as CloudSyncStatus["reachability"]) || "unknown";
    const pendingUploads = countSyncSectionMap(dirty);
    const pendingDeletes = countSyncSectionMap(tombstones);

    return {
        backupEnabled,
        cloudFeaturesAvailable: backupEnabled && reachability !== "offline",
        reachability,
        isSyncing: Boolean(cloudSyncPromise),
        pendingUploads,
        pendingDeletes,
        lastAttemptAt: syncState.lastAttemptAt ?? null,
        lastSuccessAt: syncState.lastSuccessAt ?? null,
        lastError: syncState.lastError ?? null,
        localBackupReady: hasPersistedLocalState(),
    };
};

export const cloudSyncStatus = writable<CloudSyncStatus>(createCloudSyncStatusSnapshot());

export const publishCloudSyncStatus = () => {
    cloudSyncStatus.set(createCloudSyncStatusSnapshot());
};

export const writeSyncState = (state: CloudSyncState) => {
    writeLocal(LOCAL_CLOUD_SYNC_STATE_KEY, state);
    publishCloudSyncStatus();
};

export const updateSyncState = (updater: (state: CloudSyncState) => CloudSyncState) => {
    const next = updater(readSyncState());
    writeSyncState(next);
    return next;
};

export const markDirty = (section: SyncSection, key: string) => {
    if (!key) return;
    const now = Date.now();
    updateSyncState((state) => ({
        ...createDefaultSyncState(),
        dirty: {
            addons: { ...state.dirty.addons, ...(section === "addons" ? { [key]: now } : {}) },
            library: { ...state.dirty.library, ...(section === "library" ? { [key]: now } : {}) },
            lists: { ...state.dirty.lists, ...(section === "lists" ? { [key]: now } : {}) },
            listItems: { ...state.dirty.listItems, ...(section === "listItems" ? { [key]: now } : {}) },
        },
        tombstones: {
            addons: { ...state.tombstones.addons },
            library: { ...state.tombstones.library },
            lists: { ...state.tombstones.lists },
            listItems: { ...state.tombstones.listItems },
        },
        lastAttemptAt: state.lastAttemptAt,
        lastSuccessAt: state.lastSuccessAt,
        lastError: state.lastError,
        reachability: state.reachability,
    }));
    updateSyncState((state) => {
        const next = { ...state };
        delete next.tombstones[section][key];
        return next;
    });
};

export const markDeleted = (section: SyncSection, key: string) => {
    if (!key) return;
    const now = Date.now();
    updateSyncState((state) => {
        const next = createDefaultSyncState();
        next.dirty = {
            addons: { ...state.dirty.addons },
            library: { ...state.dirty.library },
            lists: { ...state.dirty.lists },
            listItems: { ...state.dirty.listItems },
        };
        next.tombstones = {
            addons: { ...state.tombstones.addons },
            library: { ...state.tombstones.library },
            lists: { ...state.tombstones.lists },
            listItems: { ...state.tombstones.listItems },
        };
        next.lastAttemptAt = state.lastAttemptAt;
        next.lastSuccessAt = state.lastSuccessAt;
        next.lastError = state.lastError;
        next.reachability = state.reachability;
        delete next.dirty[section][key];
        next.tombstones[section][key] = now;
        return next;
    });
};

export const clearDirtyMarkers = () => {
    updateSyncState((state) => ({
        ...state,
        dirty: createEmptySyncSectionMap(),
    }));
};

export const clearDirtyMarker = (section: SyncSection, key: string) => {
    updateSyncState((state) => {
        const next = { ...state };
        next.dirty = {
            addons: { ...state.dirty.addons },
            library: { ...state.dirty.library },
            lists: { ...state.dirty.lists },
            listItems: { ...state.dirty.listItems },
        };
        delete next.dirty[section][key];
        return next;
    });
};

export const clearTombstone = (section: SyncSection, key: string) => {
    updateSyncState((state) => {
        const next = { ...state };
        next.tombstones = {
            addons: { ...state.tombstones.addons },
            library: { ...state.tombstones.library },
            lists: { ...state.tombstones.lists },
            listItems: { ...state.tombstones.listItems },
        };
        delete next.tombstones[section][key];
        return next;
    });
};

export const setSyncResult = (error: unknown | null) => {
    updateSyncState((state) => ({
        ...state,
        lastAttemptAt: Date.now(),
        lastSuccessAt: error ? state.lastSuccessAt : Date.now(),
        lastError: error ? String((error as any)?.message || error) : null,
        reachability: error ? "offline" : "online",
    }));
};

export const getCloudSyncPromise = () => cloudSyncPromise;
export const setCloudSyncPromise = (value: Promise<{ ok: boolean; error?: unknown }> | null) => {
    cloudSyncPromise = value;
    publishCloudSyncStatus();
};
export const getCloudSyncTimer = () => cloudSyncTimer;
export const setCloudSyncTimer = (value: ReturnType<typeof setTimeout> | null) => {
    cloudSyncTimer = value;
};

export const readLocalState = (): RemoteState => ({
    addons: readLocal<Addon[]>(LOCAL_ADDONS_KEY, []),
    library: readLocal<LibraryItem[]>(LOCAL_LIBRARY_KEY, []),
    lists: readLocal<List[]>(LOCAL_LISTS_KEY, []),
    listItems: readLocal<ListItem[]>(LOCAL_LIST_ITEMS_KEY, []),
});

export const writeLocalState = (state: RemoteState) => {
    writeLocal(LOCAL_ADDONS_KEY, state.addons);
    writeLocal(LOCAL_LIBRARY_KEY, state.library);
    writeLocal(LOCAL_LISTS_KEY, state.lists);
    writeLocal(LOCAL_LIST_ITEMS_KEY, state.listItems);
    publishCloudSyncStatus();
};

export const hasLocalState = () => {
    const { addons, library, lists, listItems } = readLocalState();
    return addons.length > 0 || library.length > 0 || lists.length > 0 || listItems.length > 0;
};

export const clearLocalState = () => {
    removeLocal(LOCAL_ADDONS_KEY);
    removeLocal(LOCAL_LIBRARY_KEY);
    removeLocal(LOCAL_LISTS_KEY);
    removeLocal(LOCAL_LIST_ITEMS_KEY);
    removeLocal(LOCAL_CLOUD_SYNC_STATE_KEY);
    removeLocal(LOCAL_MODE_KEY);
    publishCloudSyncStatus();
};

export const upsertLibraryItem = (
    items: LibraryItem[],
    imdb_id: string,
    progress: any,
    type: string,
    completed?: boolean,
    poster?: string,
) => {
    const existingIndex = items.findIndex((item) => item.imdb_id === imdb_id);
    const nowIso = new Date().toISOString();
    const next: LibraryItem = {
        user_id: getLocalUserId(),
        imdb_id,
        progress,
        last_watched: nowIso,
        completed_at: completed === true ? nowIso : null,
        type,
        shown: true,
        poster: poster ?? items[existingIndex]?.poster,
    };
    if (completed === false) next.completed_at = null;
    const updated = [...items];
    if (existingIndex >= 0) updated[existingIndex] = { ...items[existingIndex], ...next };
    else updated.push(next);
    return { updated, next };
};

export const listItemKey = (listId: string, imdbId: string) => `${listId}::${imdbId}`;

const toTimestamp = (value: string | null | undefined) => {
    if (!value) return 0;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const isPlainObject = (value: unknown): value is Record<string, any> =>
    Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizeProgressEntry = (value: any) => {
    const time = Number(value?.time || 0);
    const duration = Number(value?.duration || 0);
    const updatedAt = Number(value?.updatedAt || 0);
    return {
        time: Number.isFinite(time) ? Math.max(0, time) : 0,
        duration: Number.isFinite(duration) ? Math.max(0, duration) : 0,
        watched: Boolean(value?.watched),
        updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
    };
};

const compareProgressEntries = (left: any, right: any) => {
    const leftEntry = normalizeProgressEntry(left);
    const rightEntry = normalizeProgressEntry(right);
    if (leftEntry.watched !== rightEntry.watched) {
        return leftEntry.watched ? 1 : -1;
    }

    const leftRatio = leftEntry.duration > 0 ? leftEntry.time / leftEntry.duration : 0;
    const rightRatio = rightEntry.duration > 0 ? rightEntry.time / rightEntry.duration : 0;
    if (Math.abs(leftRatio - rightRatio) > 0.005) {
        return leftRatio > rightRatio ? 1 : -1;
    }

    if (Math.abs(leftEntry.time - rightEntry.time) > 1) {
        return leftEntry.time > rightEntry.time ? 1 : -1;
    }

    if (leftEntry.updatedAt !== rightEntry.updatedAt) {
        return leftEntry.updatedAt > rightEntry.updatedAt ? 1 : -1;
    }

    return 0;
};

const chooseProgressEntry = (left: any, right: any) => {
    if (!isPlainObject(left)) return right;
    if (!isPlainObject(right)) return left;
    return compareProgressEntries(left, right) >= 0 ? { ...right, ...left } : { ...left, ...right };
};

const isEpisodeProgressMap = (value: any) =>
    isPlainObject(value) && Object.values(value).some((entry) => isPlainObject(entry) && ("time" in entry || "watched" in entry));

const mergeLibraryProgress = (localProgress: any, remoteProgress: any, type: string) => {
    if (type === "series" && (isEpisodeProgressMap(localProgress) || isEpisodeProgressMap(remoteProgress))) {
        const localMap = isPlainObject(localProgress) ? localProgress : {};
        const remoteMap = isPlainObject(remoteProgress) ? remoteProgress : {};
        const merged: Record<string, any> = {};
        for (const key of new Set([...Object.keys(remoteMap), ...Object.keys(localMap)])) {
            const localEntry = localMap[key];
            const remoteEntry = remoteMap[key];
            if (localEntry == null) {
                merged[key] = remoteEntry;
                continue;
            }
            if (remoteEntry == null) {
                merged[key] = localEntry;
                continue;
            }
            merged[key] = chooseProgressEntry(localEntry, remoteEntry);
        }
        return merged;
    }

    if (isPlainObject(localProgress) && isPlainObject(remoteProgress)) {
        return chooseProgressEntry(localProgress, remoteProgress);
    }

    return localProgress ?? remoteProgress;
};

const mergeLibraryItem = (localItem: LibraryItem, remoteItem: LibraryItem) => {
    const type = localItem.type || remoteItem.type || "movie";
    const mergedProgress = mergeLibraryProgress(localItem.progress, remoteItem.progress, type);
    const mergedLastWatched = toTimestamp(localItem.last_watched) >= toTimestamp(remoteItem.last_watched)
        ? (localItem.last_watched || remoteItem.last_watched)
        : (remoteItem.last_watched || localItem.last_watched);
    const movieWatched = type === "movie" ? normalizeProgressEntry(mergedProgress).watched : null;
    const localCompletedAt = toTimestamp(localItem.completed_at);
    const remoteCompletedAt = toTimestamp(remoteItem.completed_at);
    const mergedCompletedAt = movieWatched === false
        ? null
        : localCompletedAt >= remoteCompletedAt
            ? (localItem.completed_at ?? remoteItem.completed_at ?? null)
            : (remoteItem.completed_at ?? localItem.completed_at ?? null);

    return {
        ...remoteItem,
        ...localItem,
        type,
        progress: mergedProgress,
        last_watched: mergedLastWatched || localItem.last_watched || remoteItem.last_watched,
        completed_at: mergedCompletedAt,
        shown: localItem.shown === false && remoteItem.shown === false ? false : true,
        poster: localItem.poster ?? remoteItem.poster,
    };
};

export const mergeRemoteStateIntoLocal = (remote: RemoteState) => {
    const local = readLocalState();
    const syncState = readSyncState();

    const addons = new Map(local.addons.map((item) => [item.transport_url, item]));
    for (const remoteItem of remote.addons) {
        const key = remoteItem.transport_url;
        if (syncState.tombstones.addons[key]) continue;
        const localItem = addons.get(key);
        if (!localItem) addons.set(key, { ...remoteItem });
        else if (syncState.dirty.addons[key]) {
            addons.set(key, { ...remoteItem, ...localItem, addon_id: localItem.addon_id || remoteItem.addon_id, added_at: localItem.added_at || remoteItem.added_at });
        } else {
            addons.set(key, { ...localItem, ...remoteItem, addon_id: remoteItem.addon_id || localItem.addon_id, added_at: remoteItem.added_at || localItem.added_at });
        }
    }

    const library = new Map(local.library.map((item) => [item.imdb_id, item]));
    for (const remoteItem of remote.library) {
        const key = remoteItem.imdb_id;
        if (syncState.tombstones.library[key]) continue;
        const localItem = library.get(key);
        if (!localItem) {
            library.set(key, { ...remoteItem });
        } else {
            library.set(key, mergeLibraryItem(localItem, remoteItem));
        }
    }

    const lists = new Map(local.lists.map((item) => [item.list_id, item]));
    for (const remoteItem of remote.lists) {
        const key = remoteItem.list_id;
        if (syncState.tombstones.lists[key]) continue;
        const localItem = lists.get(key);
        if (!localItem) lists.set(key, { ...remoteItem });
        else if (syncState.dirty.lists[key]) lists.set(key, { ...remoteItem, ...localItem, created_at: localItem.created_at || remoteItem.created_at });
        else lists.set(key, { ...localItem, ...remoteItem, created_at: remoteItem.created_at || localItem.created_at });
    }

    const listItems = new Map(local.listItems.map((item) => [listItemKey(item.list_id, item.imdb_id), item]));
    for (const remoteItem of remote.listItems) {
        const key = listItemKey(remoteItem.list_id, remoteItem.imdb_id);
        if (syncState.tombstones.listItems[key] || syncState.tombstones.lists[remoteItem.list_id]) continue;
        const localItem = listItems.get(key);
        if (!localItem) listItems.set(key, { ...remoteItem });
        else if (syncState.dirty.listItems[key]) listItems.set(key, { ...remoteItem, ...localItem, poster: localItem.poster ?? remoteItem.poster });
        else listItems.set(key, { ...localItem, ...remoteItem, poster: remoteItem.poster ?? localItem.poster });
    }

    const merged: RemoteState = {
        addons: Array.from(addons.values()),
        library: Array.from(library.values()),
        lists: Array.from(lists.values()),
        listItems: Array.from(listItems.values()),
    };
    writeLocalState(merged);
    return merged;
};

export const canUseCloudFeatures = () => {
    const status = get(cloudSyncStatus);
    return status.backupEnabled && status.cloudFeaturesAvailable;
};

export const getPendingCloudSyncCounts = () => {
    const syncState = readSyncState();
    return {
        uploads: countSyncSectionMap(syncState.dirty),
        deletes: countSyncSectionMap(syncState.tombstones),
    };
};

export const hasPendingCloudSyncChanges = () => {
    const counts = getPendingCloudSyncCounts();
    return counts.uploads + counts.deletes > 0;
};