import { convexAction, convexMutation, convexQuery } from "./convex";
import { getCachedUser, localMode } from "../stores/authStore";
import { get } from "svelte/store";

export interface Addon {
    user_id: string;
    added_at: string;
    transport_url: string;
    manifest: any;
    flags: any;
    addon_id: string;
}

export interface LibraryItem {
    user_id: string;
    imdb_id: string;
    progress: any;
    last_watched: string;
    completed_at: string | null;
    type: string;
    shown: boolean;
    poster?: string;
}

export interface List {
    list_id: string;
    user_id: string;
    created_at: string;
    name: string;
    position: number;
}

export interface ListItem {
    list_id: string;
    imdb_id: string;
    position: number;
    type: string;
    poster?: string;
}

export interface UserMeta {
    user_id: string;
    settings: any;
}

export interface WatchParty {
    party_id: string;
    host_user_id: string;
    imdb_id: string;
    season: number | null;
    episode: number | null;
    stream_source: string;
    file_idx: number | null;
    created_at: string;
    expires_at: string;
    current_time_seconds: number;
    is_playing: boolean;
    last_update: string;
}

export interface WatchPartyMember {
    party_id: string;
    user_id: string;
    joined_at: string;
    last_seen: string;
}

export interface TraktStatus {
    configured: boolean;
    clientId: string | null;
    redirectUri: string;
    authorizeUrl: string;
    connected: boolean;
    username: string | null;
    slug: string | null;
    scope: string | null;
    updatedAt: string | null;
    expiresAt: number | null;
}

export interface TraktScrobbleArgs {
    action: "start" | "pause" | "stop";
    imdbId: string;
    mediaType: "movie" | "episode";
    season?: number;
    episode?: number;
    progress: number;
    appVersion?: string;
}

type RemoteState = {
    addons: Addon[];
    library: LibraryItem[];
    lists: List[];
    listItems: ListItem[];
};

const LOCAL_USER_ID = "local-user";
const LOCAL_ADDONS_KEY = "local:addons";
const LOCAL_LIBRARY_KEY = "local:library";
const LOCAL_LISTS_KEY = "local:lists";
const LOCAL_LIST_ITEMS_KEY = "local:list_items";
const LOCAL_MODE_KEY = "local_mode_enabled";

const CACHE_TTL_MS = 15_000;

const DEFAULT_ADDON = {
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

const DEFAULT_TRAKT_STATUS: TraktStatus = {
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

let remoteStateCache: { userId: string; data: RemoteState; updatedAt: number } | null = null;

const isLocalModeActive = () => get(localMode) && !getCachedUser();

const readLocal = <T>(key: string, fallback: T): T => {
    if (typeof window === "undefined") return fallback;
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
};

const writeLocal = (key: string, value: any) => {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // ignore
    }
};

const removeLocal = (key: string) => {
    if (typeof window === "undefined") return;
    try {
        localStorage.removeItem(key);
    } catch {
        // ignore
    }
};

const invalidateRemoteCache = () => {
    remoteStateCache = null;
};

const getRequiredUserId = () => {
    const user = getCachedUser();
    if (!user?.id) throw new Error("Not authenticated");
    return user.id;
};

const getRemoteState = async (force = false): Promise<RemoteState> => {
    const userId = getRequiredUserId();
    const now = Date.now();
    if (
        !force &&
        remoteStateCache &&
        remoteStateCache.userId === userId &&
        now - remoteStateCache.updatedAt < CACHE_TTL_MS
    ) {
        return remoteStateCache.data;
    }

    const data = await convexQuery<RemoteState>("raffi:getState", {});
    const normalized: RemoteState = {
        addons: data?.addons || [],
        library: data?.library || [],
        lists: data?.lists || [],
        listItems: data?.listItems || [],
    };
    remoteStateCache = { userId, data: normalized, updatedAt: now };
    return normalized;
};

export const hasLocalState = () => {
    const addons = readLocal<Addon[]>(LOCAL_ADDONS_KEY, []);
    const library = readLocal<LibraryItem[]>(LOCAL_LIBRARY_KEY, []);
    const lists = readLocal<List[]>(LOCAL_LISTS_KEY, []);
    const items = readLocal<ListItem[]>(LOCAL_LIST_ITEMS_KEY, []);
    return addons.length > 0 || library.length > 0 || lists.length > 0 || items.length > 0;
};

export const clearLocalState = () => {
    removeLocal(LOCAL_ADDONS_KEY);
    removeLocal(LOCAL_LIBRARY_KEY);
    removeLocal(LOCAL_LISTS_KEY);
    removeLocal(LOCAL_LIST_ITEMS_KEY);
    removeLocal(LOCAL_MODE_KEY);
};

export const ensureDefaultAddonsForUser = async (userId: string) => {
    if (!userId) return;
    try {
        await convexMutation("raffi:ensureDefaultAddon", { addon: DEFAULT_ADDON });
        invalidateRemoteCache();
    } catch (e) {
        console.warn("Failed to seed default addons", e);
    }
};

export const ensureDefaultAddonsForLocal = async () => {
    if (!isLocalModeActive()) return;
    const addons = readLocal<Addon[]>(LOCAL_ADDONS_KEY, []);
    if (addons.some((addon) => addon.transport_url === DEFAULT_ADDON.transportUrl)) return;
    const next: Addon[] = [
        ...addons,
        {
            user_id: LOCAL_USER_ID,
            added_at: new Date().toISOString(),
            transport_url: DEFAULT_ADDON.transportUrl,
            manifest: DEFAULT_ADDON.manifest,
            flags: { protected: false, official: false },
            addon_id: crypto.randomUUID(),
        },
    ];
    writeLocal(LOCAL_ADDONS_KEY, next);
};

export const syncLocalStateToUser = async (userId: string) => {
    if (!userId) return;

    const addons = readLocal<Addon[]>(LOCAL_ADDONS_KEY, []);
    const library = readLocal<LibraryItem[]>(LOCAL_LIBRARY_KEY, []);
    const lists = readLocal<List[]>(LOCAL_LISTS_KEY, []);
    const listItems = readLocal<ListItem[]>(LOCAL_LIST_ITEMS_KEY, []);

    if (addons.length === 0 && library.length === 0 && lists.length === 0 && listItems.length === 0) {
        clearLocalState();
        return;
    }

    const normalizedLibrary = library.map((item) => {
        const next: any = { ...item };
        if (next.poster == null) {
            delete next.poster;
        }
        return next;
    });

    const normalizedListItems = listItems.map((item) => {
        const next: any = { ...item };
        if (next.poster == null) {
            delete next.poster;
        }
        return next;
    });

    await convexMutation("raffi:importState", {
        addons,
        library: normalizedLibrary,
        lists,
        listItems: normalizedListItems,
    });

    clearLocalState();
    invalidateRemoteCache();
};

export const syncUserStateToLocal = async (userId: string) => {
    if (!userId) return;
    clearLocalState();
    const data = await convexQuery<RemoteState>("raffi:getState", {});
    writeLocal(LOCAL_ADDONS_KEY, data?.addons || []);
    writeLocal(LOCAL_LIBRARY_KEY, data?.library || []);
    writeLocal(LOCAL_LISTS_KEY, data?.lists || []);
    writeLocal(LOCAL_LIST_ITEMS_KEY, data?.listItems || []);
};

export const getAddons = async () => {
    if (isLocalModeActive()) {
        return readLocal<Addon[]>(LOCAL_ADDONS_KEY, []);
    }
    const data = await getRemoteState();
    return data.addons;
};

export const addAddon = async (addon: Omit<Addon, "user_id" | "added_at">) => {
    if (isLocalModeActive()) {
        const current = readLocal<Addon[]>(LOCAL_ADDONS_KEY, []);
        const existing = current.find((item) => item.transport_url === addon.transport_url);
        if (existing) return existing;
        const next: Addon = {
            ...addon,
            user_id: LOCAL_USER_ID,
            added_at: new Date().toISOString(),
            addon_id: addon.addon_id || crypto.randomUUID(),
        } as Addon;
        writeLocal(LOCAL_ADDONS_KEY, [...current, next]);
        return next;
    }

    getRequiredUserId();
    const result = await convexMutation<Addon>("raffi:addAddon", { addon });
    invalidateRemoteCache();
    return result;
};

export const removeAddon = async (transport_url: string) => {
    if (isLocalModeActive()) {
        const current = readLocal<Addon[]>(LOCAL_ADDONS_KEY, []);
        writeLocal(
            LOCAL_ADDONS_KEY,
            current.filter((item) => item.transport_url !== transport_url),
        );
        return;
    }

    getRequiredUserId();
    await convexMutation("raffi:removeAddon", { transport_url });
    invalidateRemoteCache();
};

export const getLibrary = async (limit = 100, offset = 0) => {
    if (isLocalModeActive()) {
        const items = readLocal<LibraryItem[]>(LOCAL_LIBRARY_KEY, []);
        const sorted = [...items].sort((a, b) => (b.last_watched || "").localeCompare(a.last_watched || ""));
        return sorted.slice(offset, offset + limit);
    }
    const data = await getRemoteState();
    const sorted = [...data.library].sort((a, b) => (b.last_watched || "").localeCompare(a.last_watched || ""));
    return sorted.slice(offset, offset + limit);
};

export const getLibraryItem = async (imdb_id: string) => {
    if (isLocalModeActive()) {
        const items = readLocal<LibraryItem[]>(LOCAL_LIBRARY_KEY, []);
        return items.find((item) => item.imdb_id === imdb_id) ?? null;
    }
    const data = await getRemoteState();
    return data.library.find((item) => item.imdb_id === imdb_id) ?? null;
};

export const hideFromContinueWatching = async (imdb_id: string) => {
    if (isLocalModeActive()) {
        const items = readLocal<LibraryItem[]>(LOCAL_LIBRARY_KEY, []);
        writeLocal(
            LOCAL_LIBRARY_KEY,
            items.map((item) => (item.imdb_id === imdb_id ? { ...item, shown: false } : item)),
        );
        return;
    }
    getRequiredUserId();
    await convexMutation("raffi:hideFromContinueWatching", { imdb_id });
    invalidateRemoteCache();
};

export const forgetProgress = async (imdb_id: string) => {
    if (isLocalModeActive()) {
        const items = readLocal<LibraryItem[]>(LOCAL_LIBRARY_KEY, []);
        writeLocal(
            LOCAL_LIBRARY_KEY,
            items.filter((item) => item.imdb_id !== imdb_id),
        );
        return;
    }
    getRequiredUserId();
    await convexMutation("raffi:forgetProgress", { imdb_id });
    invalidateRemoteCache();
};

export const updateLibraryProgress = async (
    imdb_id: string,
    progress: any,
    type: string,
    completed?: boolean,
    poster?: string,
) => {
    if (isLocalModeActive()) {
        const items = readLocal<LibraryItem[]>(LOCAL_LIBRARY_KEY, []);
        const existingIndex = items.findIndex((item) => item.imdb_id === imdb_id);
        const next: LibraryItem = {
            user_id: LOCAL_USER_ID,
            imdb_id,
            progress,
            last_watched: new Date().toISOString(),
            completed_at: completed === true ? new Date().toISOString() : null,
            type,
            shown: true,
            poster: poster ?? items[existingIndex]?.poster,
        };
        if (completed === false) {
            next.completed_at = null;
        }
        const updated = [...items];
        if (existingIndex >= 0) {
            updated[existingIndex] = { ...items[existingIndex], ...next };
        } else {
            updated.push(next);
        }
        writeLocal(LOCAL_LIBRARY_KEY, updated);
        return next;
    }

    getRequiredUserId();
    const result = await convexMutation<LibraryItem>("raffi:updateLibraryProgress", { imdb_id,
        progress,
        type,
        completed,
        poster,
    });
    invalidateRemoteCache();
    return result;
};

export const updateLibraryPoster = async (imdb_id: string, poster: string) => {
    if (isLocalModeActive()) {
        const items = readLocal<LibraryItem[]>(LOCAL_LIBRARY_KEY, []);
        writeLocal(
            LOCAL_LIBRARY_KEY,
            items.map((item) => (item.imdb_id === imdb_id ? { ...item, poster } : item)),
        );
        return;
    }
    getRequiredUserId();
    await convexMutation("raffi:updateLibraryPoster", { imdb_id, poster });
    invalidateRemoteCache();
};

export const getTraktStatus = async (): Promise<TraktStatus> => {
    if (isLocalModeActive()) {
        return DEFAULT_TRAKT_STATUS;
    }
    getRequiredUserId();
    const status = await convexQuery<TraktStatus>("raffi:getTraktStatus", {});
    return status || DEFAULT_TRAKT_STATUS;
};

export const exchangeTraktCode = async (code: string) => {
    getRequiredUserId();
    return convexAction("raffi:exchangeTraktCode", { code });
};

export const disconnectTrakt = async () => {
    if (isLocalModeActive()) return { ok: true };
    getRequiredUserId();
    return convexMutation("raffi:disconnectTrakt", {});
};

export const refreshTraktToken = async () => {
    getRequiredUserId();
    return convexAction("raffi:refreshTraktToken", {});
};

export const traktScrobble = async (args: TraktScrobbleArgs) => {
    if (isLocalModeActive()) return { ok: false, reason: "local_mode" };
    getRequiredUserId();
    return convexAction("raffi:traktScrobble", args as any);
};

export const getLists = async () => {
    if (isLocalModeActive()) {
        const lists = readLocal<List[]>(LOCAL_LISTS_KEY, []);
        return [...lists].sort((a, b) => a.position - b.position);
    }
    const data = await getRemoteState();
    return [...data.lists].sort((a, b) => a.position - b.position);
};

export const getListsWithItems = async () => {
    if (isLocalModeActive()) {
        const lists = readLocal<List[]>(LOCAL_LISTS_KEY, []);
        const items = readLocal<ListItem[]>(LOCAL_LIST_ITEMS_KEY, []);
        const itemsByListId: Record<string, ListItem[]> = {};
        items.forEach((item) => {
            if (!itemsByListId[item.list_id]) itemsByListId[item.list_id] = [];
            itemsByListId[item.list_id].push(item);
        });
        return lists
            .map((list) => ({
                ...list,
                list_items: (itemsByListId[list.list_id] || []).sort((a, b) => a.position - b.position),
            }))
            .sort((a, b) => a.position - b.position);
    }

    const data = await getRemoteState();
    const itemsByListId: Record<string, ListItem[]> = {};
    data.listItems.forEach((item) => {
        if (!itemsByListId[item.list_id]) itemsByListId[item.list_id] = [];
        itemsByListId[item.list_id].push(item);
    });
    return [...data.lists]
        .sort((a, b) => a.position - b.position)
        .map((list) => ({
            ...list,
            list_items: [...(itemsByListId[list.list_id] || [])].sort((a, b) => a.position - b.position),
        }));
};

export const getListMembershipByImdb = async (imdbId: string): Promise<Set<string>> => {
    if (isLocalModeActive()) {
        const items = readLocal<ListItem[]>(LOCAL_LIST_ITEMS_KEY, []);
        return new Set(items.filter((item) => item.imdb_id === imdbId).map((item) => item.list_id));
    }
    const data = await getRemoteState();
    return new Set(data.listItems.filter((item) => item.imdb_id === imdbId).map((item) => item.list_id));
};

export const createList = async (name: string) => {
    if (isLocalModeActive()) {
        const lists = readLocal<List[]>(LOCAL_LISTS_KEY, []);
        const position = lists.length ? Math.max(...lists.map((l) => l.position)) + 1 : 1;
        const next: List = {
            list_id: crypto.randomUUID(),
            user_id: LOCAL_USER_ID,
            created_at: new Date().toISOString(),
            name,
            position,
        };
        writeLocal(LOCAL_LISTS_KEY, [...lists, next]);
        return next;
    }
    getRequiredUserId();
    const list = await convexMutation<List>("raffi:createList", { name });
    invalidateRemoteCache();
    return list;
};

export const updateList = async (list_id: string, updates: Partial<List>) => {
    if (isLocalModeActive()) {
        const lists = readLocal<List[]>(LOCAL_LISTS_KEY, []);
        writeLocal(
            LOCAL_LISTS_KEY,
            lists.map((list) => (list.list_id === list_id ? { ...list, ...updates } : list)),
        );
        return;
    }
    getRequiredUserId();
    await convexMutation("raffi:updateList", { list_id, updates });
    invalidateRemoteCache();
};

export const deleteList = async (list_id: string) => {
    if (isLocalModeActive()) {
        const lists = readLocal<List[]>(LOCAL_LISTS_KEY, []);
        const items = readLocal<ListItem[]>(LOCAL_LIST_ITEMS_KEY, []);
        writeLocal(
            LOCAL_LISTS_KEY,
            lists.filter((list) => list.list_id !== list_id),
        );
        writeLocal(
            LOCAL_LIST_ITEMS_KEY,
            items.filter((item) => item.list_id !== list_id),
        );
        return;
    }
    getRequiredUserId();
    await convexMutation("raffi:deleteList", { list_id });
    invalidateRemoteCache();
};

export const addToList = async (
    list_id: string,
    imdb_id: string,
    position: number,
    type: string,
    poster?: string,
) => {
    if (isLocalModeActive()) {
        const items = readLocal<ListItem[]>(LOCAL_LIST_ITEMS_KEY, []);
        const existingIndex = items.findIndex(
            (item) => item.list_id === list_id && item.imdb_id === imdb_id,
        );
        const next: ListItem = { list_id, imdb_id, position, type, poster };
        const updated = [...items];
        if (existingIndex >= 0) {
            updated[existingIndex] = { ...items[existingIndex], ...next };
        } else {
            updated.push(next);
        }
        writeLocal(LOCAL_LIST_ITEMS_KEY, updated);
        return;
    }
    getRequiredUserId();
    await convexMutation("raffi:addToList", { list_id, imdb_id, position, type, poster });
    invalidateRemoteCache();
};

export const removeFromList = async (list_id: string, imdb_id: string) => {
    if (isLocalModeActive()) {
        const items = readLocal<ListItem[]>(LOCAL_LIST_ITEMS_KEY, []);
        writeLocal(
            LOCAL_LIST_ITEMS_KEY,
            items.filter((item) => !(item.list_id === list_id && item.imdb_id === imdb_id)),
        );
        return;
    }
    getRequiredUserId();
    await convexMutation("raffi:removeFromList", { list_id, imdb_id });
    invalidateRemoteCache();
};

export const getListItems = async (list_id: string) => {
    if (isLocalModeActive()) {
        const items = readLocal<ListItem[]>(LOCAL_LIST_ITEMS_KEY, []);
        return items.filter((item) => item.list_id === list_id).sort((a, b) => a.position - b.position);
    }
    const data = await getRemoteState();
    return data.listItems.filter((item) => item.list_id === list_id).sort((a, b) => a.position - b.position);
};

export const updateListItemPosition = async (list_id: string, imdb_id: string, position: number) => {
    if (isLocalModeActive()) {
        const items = readLocal<ListItem[]>(LOCAL_LIST_ITEMS_KEY, []);
        writeLocal(
            LOCAL_LIST_ITEMS_KEY,
            items.map((item) =>
                item.list_id === list_id && item.imdb_id === imdb_id ? { ...item, position } : item,
            ),
        );
        return;
    }
    getRequiredUserId();
    await convexMutation("raffi:updateListItemPosition", { list_id, imdb_id, position });
    invalidateRemoteCache();
};

export const updateListItemPoster = async (list_id: string, imdb_id: string, poster: string) => {
    if (isLocalModeActive()) {
        const items = readLocal<ListItem[]>(LOCAL_LIST_ITEMS_KEY, []);
        writeLocal(
            LOCAL_LIST_ITEMS_KEY,
            items.map((item) =>
                item.list_id === list_id && item.imdb_id === imdb_id ? { ...item, poster } : item,
            ),
        );
        return;
    }
    getRequiredUserId();
    await convexMutation("raffi:updateListItemPoster", { list_id, imdb_id, poster });
    invalidateRemoteCache();
};

export const createWatchParty = async (
    imdbId: string,
    streamSource: string,
    season: number | null = null,
    episode: number | null = null,
    fileIdx: number | null = null,
) => {
    getRequiredUserId();
    return convexMutation<WatchParty>("raffi:createWatchParty", { imdbId,
        streamSource,
        season,
        episode,
        fileIdx,
    });
};

export const joinWatchParty = async (partyId: string) => {
    getRequiredUserId();
    return convexMutation("raffi:joinWatchParty", { partyId });
};

export const leaveWatchParty = async (partyId: string) => {
    getRequiredUserId();
    return convexMutation("raffi:leaveWatchParty", { partyId });
};

export const updateWatchPartyState = async (partyId: string, currentTimeSeconds: number, isPlaying: boolean) => {
    getRequiredUserId();
    return convexMutation("raffi:updateWatchPartyState", { partyId,
        currentTimeSeconds,
        isPlaying,
    });
};

export const getWatchParty = async (partyId: string) => {
    return convexQuery<WatchParty | null>("raffi:getWatchParty", { partyId });
};

export const getWatchPartyInfo = async (partyId: string) => {
    return convexQuery<any>("raffi:getWatchPartyInfo", { partyId });
};

export const getActiveWatchParties = async () => {
    return convexQuery<WatchParty[]>("raffi:getActiveWatchParties", {});
};

export const updateMemberLastSeen = async (partyId: string) => {
    getRequiredUserId();
    return convexMutation("raffi:updateMemberLastSeen", { partyId });
};

export const getWatchPartyMembers = async (partyId: string) => {
    return convexQuery<WatchPartyMember[]>("raffi:getWatchPartyMembers", { partyId });
};
