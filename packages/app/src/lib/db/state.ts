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
    UserMeta,
} from "./types";
import { reconcileRemoteState } from "./reconciliation";

export { mergeProgressEntry } from "./reconciliation";

export const LOCAL_USER_ID = "local-user";
export const LOCAL_ADDONS_KEY = "local:addons";
export const LOCAL_LIBRARY_KEY = "local:library";
export const LOCAL_LISTS_KEY = "local:lists";
export const LOCAL_LIST_ITEMS_KEY = "local:list_items";
export const LOCAL_USER_META_KEY = "local:user_meta";
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
let cloudSyncPaused = false;
let cloudSyncPausedDepth = 0;

const clearCloudSyncTimer = () => {
    const currentTimer = cloudSyncTimer;
    if (currentTimer) {
        clearTimeout(currentTimer);
        cloudSyncTimer = null;
    }
};

export const isCloudSyncPaused = () => cloudSyncPaused || cloudSyncPausedDepth > 0;

export const pauseCloudSync = () => {
    cloudSyncPausedDepth += 1;
    clearCloudSyncTimer();
    publishCloudSyncStatus();
};

export const resumeCloudSync = () => {
    cloudSyncPausedDepth = Math.max(0, cloudSyncPausedDepth - 1);
    publishCloudSyncStatus();
};

export const setCloudSyncPaused = (paused: boolean) => {
    cloudSyncPaused = paused;
    if (paused) clearCloudSyncTimer();
    publishCloudSyncStatus();
};

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
    + countKeys(map?.listItems || {})
    + countKeys(map?.userMeta || {});

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
    const userMeta = readLocal<UserMeta | null>(LOCAL_USER_META_KEY, null);
    return addons.length > 0 || library.length > 0 || lists.length > 0 || listItems.length > 0 || Boolean(userMeta);
};

const createEmptySyncSectionMap = (): SyncStateSectionMap => ({
    addons: {},
    library: {},
    lists: {},
    listItems: {},
    userMeta: {},
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
            userMeta: { ...(raw.dirty?.userMeta || {}) },
        },
        tombstones: {
            addons: { ...(raw.tombstones?.addons || {}) },
            library: { ...(raw.tombstones?.library || {}) },
            lists: { ...(raw.tombstones?.lists || {}) },
            listItems: { ...(raw.tombstones?.listItems || {}) },
            userMeta: { ...(raw.tombstones?.userMeta || {}) },
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
    const isSyncing = Boolean(cloudSyncPromise) && !isCloudSyncPaused();

    return {
        backupEnabled,
        cloudFeaturesAvailable: backupEnabled && reachability !== "offline",
        reachability,
        isSyncing,
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
            userMeta: { ...state.dirty.userMeta, ...(section === "userMeta" ? { [key]: now } : {}) },
        },
        tombstones: {
            addons: { ...state.tombstones.addons },
            library: { ...state.tombstones.library },
            lists: { ...state.tombstones.lists },
            listItems: { ...state.tombstones.listItems },
            userMeta: { ...state.tombstones.userMeta },
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
            userMeta: { ...state.dirty.userMeta },
        };
        next.tombstones = {
            addons: { ...state.tombstones.addons },
            library: { ...state.tombstones.library },
            lists: { ...state.tombstones.lists },
            listItems: { ...state.tombstones.listItems },
            userMeta: { ...state.tombstones.userMeta },
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
            userMeta: { ...state.dirty.userMeta },
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
            userMeta: { ...state.tombstones.userMeta },
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
export const cancelCloudSyncTimer = () => {
    clearCloudSyncTimer();
    publishCloudSyncStatus();
};

export const readLocalState = (): RemoteState => ({
    addons: readLocal<Addon[]>(LOCAL_ADDONS_KEY, []),
    library: readLocal<LibraryItem[]>(LOCAL_LIBRARY_KEY, []),
    lists: readLocal<List[]>(LOCAL_LISTS_KEY, []),
    listItems: readLocal<ListItem[]>(LOCAL_LIST_ITEMS_KEY, []),
    userMeta: readLocal<UserMeta | null>(LOCAL_USER_META_KEY, null),
    tombstones: [],
});

export const writeLocalState = (state: RemoteState) => {
    writeLocal(LOCAL_ADDONS_KEY, state.addons);
    writeLocal(LOCAL_LIBRARY_KEY, state.library);
    writeLocal(LOCAL_LISTS_KEY, state.lists);
    writeLocal(LOCAL_LIST_ITEMS_KEY, state.listItems);
    if (state.userMeta) {
        writeLocal(LOCAL_USER_META_KEY, state.userMeta);
    } else {
        removeLocal(LOCAL_USER_META_KEY);
    }
    publishCloudSyncStatus();
};

export const hasLocalState = () => {
    const { addons, library, lists, listItems, userMeta } = readLocalState();
    return addons.length > 0 || library.length > 0 || lists.length > 0 || listItems.length > 0 || Boolean(userMeta);
};

export const clearLocalState = () => {
    removeLocal(LOCAL_ADDONS_KEY);
    removeLocal(LOCAL_LIBRARY_KEY);
    removeLocal(LOCAL_LISTS_KEY);
    removeLocal(LOCAL_LIST_ITEMS_KEY);
    removeLocal(LOCAL_USER_META_KEY);
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
    const existing = existingIndex >= 0 ? items[existingIndex] : null;
    const nowIso = new Date().toISOString();
    const next: LibraryItem = {
        user_id: getLocalUserId(),
        imdb_id,
        progress,
        last_watched: nowIso,
        completed_at: completed === true ? nowIso : null,
        type,
        shown: true,
        poster: poster ?? existing?.poster,
        updated_at: nowIso,
    };
    if (completed === false) next.completed_at = null;
    const updated = [...items];
    if (existingIndex >= 0) updated[existingIndex] = { ...items[existingIndex], ...next };
    else updated.push(next);
    return { updated, next };
};

export const listItemKey = (listId: string, imdbId: string) => `${listId}::${imdbId}`;

export const mergeRemoteStateIntoLocal = (remote: RemoteState) => {
    const local = readLocalState();
    const syncState = readSyncState();
    const reconciled = reconcileRemoteState(local, remote, syncState);
    writeSyncState(reconciled.syncState);
    writeLocalState(reconciled.state);
    return reconciled.state;
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
