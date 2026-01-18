import { supabase } from './supabase';
import { getCachedUser, localMode } from '../stores/authStore';
import { get } from 'svelte/store';

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

const LOCAL_USER_ID = 'local-user';
const LOCAL_ADDONS_KEY = 'local:addons';
const LOCAL_LIBRARY_KEY = 'local:library';
const LOCAL_LISTS_KEY = 'local:lists';
const LOCAL_LIST_ITEMS_KEY = 'local:list_items';
const LOCAL_MODE_KEY = 'local_mode_enabled';

const isLocalModeActive = () => get(localMode) && !getCachedUser();

const readLocal = <T>(key: string, fallback: T): T => {
    if (typeof window === 'undefined') return fallback;
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
};

const writeLocal = (key: string, value: any) => {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // ignore
    }
};

const removeLocal = (key: string) => {
    if (typeof window === 'undefined') return;
    try {
        localStorage.removeItem(key);
    } catch {
        // ignore
    }
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

export const ensureDefaultAddonsForUser = async (userId: string) => {
    if (!userId) return;

    try {
        const { data, error } = await supabase
            .from("addons")
            .select("transport_url")
            .eq("user_id", userId)
            .eq("transport_url", DEFAULT_ADDON.transportUrl)
            .maybeSingle();
        if (error) throw error;
        if (data) return;

        const { error: insertError } = await supabase.from("addons").insert({
            user_id: userId,
            transport_url: DEFAULT_ADDON.transportUrl,
            manifest: DEFAULT_ADDON.manifest,
            flags: { protected: false, official: false },
        });
        if (insertError) throw insertError;
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

    if (addons.length) {
        const payload = addons.map((addon) => ({
            ...addon,
            user_id: userId,
            added_at: addon.added_at || new Date().toISOString(),
        }));
        const { error } = await supabase
            .from('addons')
            .upsert(payload, { onConflict: 'user_id,transport_url' });
        if (error) throw error;
    }

    if (library.length) {
        const payload = library.map((item) => ({
            ...item,
            user_id: userId,
        }));
        const { error } = await supabase
            .from('libraries')
            .upsert(payload, { onConflict: 'user_id,imdb_id' });
        if (error) throw error;
    }

    if (lists.length) {
        const payload = lists.map((list) => ({
            ...list,
            user_id: userId,
        }));
        const { error } = await supabase
            .from('lists')
            .upsert(payload, { onConflict: 'list_id' });
        if (error) throw error;
    }

    if (listItems.length) {
        const payload = listItems.map((item) => ({
            ...item,
        }));
        const { error } = await supabase
            .from('list_items')
            .upsert(payload, { onConflict: 'list_id,imdb_id' });
        if (error) throw error;
    }

    clearLocalState();
};

export const syncUserStateToLocal = async (userId: string) => {
    if (!userId) return;

    clearLocalState();

    const [addonsRes, libraryRes, listsRes] = await Promise.all([
        supabase.from('addons').select('*').eq('user_id', userId),
        supabase.from('libraries').select('*').eq('user_id', userId),
        supabase.from('lists').select('*').eq('user_id', userId),
    ]);

    if (addonsRes.error) throw addonsRes.error;
    if (libraryRes.error) throw libraryRes.error;
    if (listsRes.error) throw listsRes.error;

    const listIds = (listsRes.data || []).map((list) => list.list_id);
    let listItems: ListItem[] = [];
    if (listIds.length > 0) {
        const { data, error } = await supabase
            .from('list_items')
            .select('*')
            .in('list_id', listIds);
        if (error) throw error;
        listItems = data || [];
    }

    writeLocal(LOCAL_ADDONS_KEY, addonsRes.data || []);
    writeLocal(LOCAL_LIBRARY_KEY, libraryRes.data || []);
    writeLocal(LOCAL_LISTS_KEY, listsRes.data || []);
    writeLocal(LOCAL_LIST_ITEMS_KEY, listItems);
};

// Addons
export const getAddons = async () => {
    if (isLocalModeActive()) {
        return readLocal<Addon[]>(LOCAL_ADDONS_KEY, []);
    }
    const { data, error } = await supabase.from('addons').select('*');
    if (error) throw error;
    return data as Addon[];
};

export const addAddon = async (addon: Omit<Addon, 'user_id' | 'added_at'>) => {
    if (isLocalModeActive()) {
        const current = readLocal<Addon[]>(LOCAL_ADDONS_KEY, []);
        if (current.some((item) => item.transport_url === addon.transport_url)) {
            return current.find((item) => item.transport_url === addon.transport_url) as Addon;
        }
        const next: Addon = {
            ...addon,
            user_id: LOCAL_USER_ID,
            added_at: new Date().toISOString(),
            addon_id: addon.addon_id || crypto.randomUUID(),
        } as Addon;
        const updated = [...current, next];
        writeLocal(LOCAL_ADDONS_KEY, updated);
        return next;
    }

    const user = getCachedUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase.from('addons').insert({
        user_id: user.id,
        added_at: new Date().toISOString(),
        ...addon
    }).select().single();
    if (error) throw error;
    return data as Addon;
};

export const removeAddon = async (transport_url: string) => {
    if (isLocalModeActive()) {
        const current = readLocal<Addon[]>(LOCAL_ADDONS_KEY, []);
        const updated = current.filter((item) => item.transport_url !== transport_url);
        writeLocal(LOCAL_ADDONS_KEY, updated);
        return;
    }

    const user = getCachedUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase.from('addons').delete().eq('user_id', user.id).eq('transport_url', transport_url);
    if (error) throw error;
};

// Library
export const getLibrary = async (limit: number = 100, offset: number = 0) => {
    if (isLocalModeActive()) {
        const items = readLocal<LibraryItem[]>(LOCAL_LIBRARY_KEY, []);
        const sorted = [...items].sort((a, b) =>
            (b.last_watched || '').localeCompare(a.last_watched || ''),
        );
        return sorted.slice(offset, offset + limit);
    }
    const { data, error } = await supabase
        .from('libraries')
        .select('*')
        .order('last_watched', { ascending: false })
        .range(offset, offset + limit - 1);
    if (error) throw error;
    return data as LibraryItem[];
};

export const getLibraryItem = async (imdb_id: string) => {
    if (isLocalModeActive()) {
        const items = readLocal<LibraryItem[]>(LOCAL_LIBRARY_KEY, []);
        return items.find((item) => item.imdb_id === imdb_id) ?? null;
    }
    const user = getCachedUser();
    if (!user) return null;

    const { data, error } = await supabase.from('libraries').select('*').eq('user_id', user.id).eq('imdb_id', imdb_id).maybeSingle();
    if (error) throw error;
    return data as LibraryItem | null;
};

export const hideFromContinueWatching = async (imdb_id: string) => {
    if (isLocalModeActive()) {
        const items = readLocal<LibraryItem[]>(LOCAL_LIBRARY_KEY, []);
        const updated = items.map((item) =>
            item.imdb_id === imdb_id ? { ...item, shown: false } : item,
        );
        writeLocal(LOCAL_LIBRARY_KEY, updated);
        return;
    }
    const user = getCachedUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
        .from('libraries')
        .update({ shown: false })
        .eq('user_id', user.id)
        .eq('imdb_id', imdb_id);
    if (error) throw error;
};

export const forgetProgress = async (imdb_id: string) => {
    if (isLocalModeActive()) {
        const items = readLocal<LibraryItem[]>(LOCAL_LIBRARY_KEY, []);
        const updated = items.filter((item) => item.imdb_id !== imdb_id);
        writeLocal(LOCAL_LIBRARY_KEY, updated);
        return;
    }
    const user = getCachedUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
        .from('libraries')
        .delete()
        .eq('user_id', user.id)
        .eq('imdb_id', imdb_id);
    if (error) throw error;
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
    const user = getCachedUser();
    if (!user) throw new Error('Not authenticated');

    const updates: any = {
        user_id: user.id,
        imdb_id,
        progress,
        last_watched: new Date().toISOString(),
        type,
        shown: true,
    };
    if (completed === true) {
        updates.completed_at = new Date().toISOString();
    } else if (completed === false) {
        updates.completed_at = null;
    }
    if (poster) {
        updates.poster = poster;
    }

    // Use upsert to handle race conditions
    const { data, error } = await supabase
        .from('libraries')
        .upsert(updates, { onConflict: 'user_id,imdb_id' })
        .select()
        .single();
    if (error) throw error;
    return data as LibraryItem;
};

export const updateLibraryPoster = async (imdb_id: string, poster: string) => {
    if (isLocalModeActive()) {
        const items = readLocal<LibraryItem[]>(LOCAL_LIBRARY_KEY, []);
        const updated = items.map((item) =>
            item.imdb_id === imdb_id ? { ...item, poster } : item,
        );
        writeLocal(LOCAL_LIBRARY_KEY, updated);
        return;
    }
    const user = getCachedUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
        .from('libraries')
        .update({ poster })
        .eq('user_id', user.id)
        .eq('imdb_id', imdb_id);
    if (error) throw error;
};

// Lists
export const getLists = async () => {
    if (isLocalModeActive()) {
        const lists = readLocal<List[]>(LOCAL_LISTS_KEY, []);
        return [...lists].sort((a, b) => a.position - b.position);
    }
    const { data, error } = await supabase.from('lists').select('*').order('position', { ascending: true });
    if (error) throw error;
    return data as List[];
};

// Get lists with their items in a single query (more efficient)
export const getListsWithItems = async () => {
    if (isLocalModeActive()) {
        const lists = readLocal<List[]>(LOCAL_LISTS_KEY, []);
        const items = readLocal<ListItem[]>(LOCAL_LIST_ITEMS_KEY, []);
        const itemsByListId: Record<string, ListItem[]> = {};
        items.forEach((item) => {
            if (!itemsByListId[item.list_id]) {
                itemsByListId[item.list_id] = [];
            }
            itemsByListId[item.list_id].push(item);
        });
        return lists
            .map((list) => ({
                ...list,
                list_items: (itemsByListId[list.list_id] || []).sort(
                    (a, b) => a.position - b.position,
                ),
            }))
            .sort((a, b) => a.position - b.position);
    }
    const { data: lists, error: listsError } = await supabase
        .from('lists')
        .select('*')
        .order('position', { ascending: true });

    if (listsError) throw listsError;
    if (!lists || lists.length === 0) return [];

    const listIds = lists.map(list => list.list_id);

    const { data: allItems, error: itemsError } = await supabase
        .from('list_items')
        .select('*')
        .in('list_id', listIds)
        .order('position', { ascending: true });

    if (itemsError) throw itemsError;

    const itemsByListId: Record<string, ListItem[]> = {};
    allItems?.forEach(item => {
        if (!itemsByListId[item.list_id]) {
            itemsByListId[item.list_id] = [];
        }
        itemsByListId[item.list_id].push(item);
    });

    return lists.map(list => ({
        ...list,
        list_items: itemsByListId[list.list_id] || []
    }));
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
        const updated = [...lists, next];
        writeLocal(LOCAL_LISTS_KEY, updated);
        return next;
    }
    const user = getCachedUser();
    if (!user) throw new Error('Not authenticated');

    // Get max position
    const { data: maxPosData } = await supabase.from('lists').select('position').order('position', { ascending: false }).limit(1).maybeSingle();
    const position = (maxPosData?.position || 0) + 1;

    const { data, error } = await supabase.from('lists').insert({
        user_id: user.id,
        name,
        position,
        created_at: new Date().toISOString()
    }).select().single();
    if (error) throw error;
    return data as List;
};

export const updateList = async (list_id: string, updates: Partial<List>) => {
    if (isLocalModeActive()) {
        const lists = readLocal<List[]>(LOCAL_LISTS_KEY, []);
        const updated = lists.map((list) =>
            list.list_id === list_id ? { ...list, ...updates } : list,
        );
        writeLocal(LOCAL_LISTS_KEY, updated);
        return;
    }
    const { error } = await supabase.from('lists').update(updates).eq('list_id', list_id);
    if (error) throw error;
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
    const { error } = await supabase.from('lists').delete().eq('list_id', list_id);
    if (error) throw error;
};

export const addToList = async (list_id: string, imdb_id: string, position: number, type: string, poster?: string) => {
    if (isLocalModeActive()) {
        const items = readLocal<ListItem[]>(LOCAL_LIST_ITEMS_KEY, []);
        const existingIndex = items.findIndex(
            (item) => item.list_id === list_id && item.imdb_id === imdb_id,
        );
        const next: ListItem = {
            list_id,
            imdb_id,
            position,
            type,
            poster,
        };
        const updated = [...items];
        if (existingIndex >= 0) {
            updated[existingIndex] = { ...items[existingIndex], ...next };
        } else {
            updated.push(next);
        }
        writeLocal(LOCAL_LIST_ITEMS_KEY, updated);
        return;
    }
    const { error } = await supabase.from('list_items').insert({
        list_id,
        imdb_id,
        position,
        type,
        poster
    });
    if (error) throw error;
};

export const removeFromList = async (list_id: string, imdb_id: string) => {
    if (isLocalModeActive()) {
        const items = readLocal<ListItem[]>(LOCAL_LIST_ITEMS_KEY, []);
        const updated = items.filter(
            (item) => !(item.list_id === list_id && item.imdb_id === imdb_id),
        );
        writeLocal(LOCAL_LIST_ITEMS_KEY, updated);
        return;
    }
    const { error } = await supabase.from('list_items').delete().eq('list_id', list_id).eq('imdb_id', imdb_id);
    if (error) throw error;
};

export const getListItems = async (list_id: string) => {
    if (isLocalModeActive()) {
        const items = readLocal<ListItem[]>(LOCAL_LIST_ITEMS_KEY, []);
        return items
            .filter((item) => item.list_id === list_id)
            .sort((a, b) => a.position - b.position);
    }
    const { data, error } = await supabase.from('list_items').select('*').eq('list_id', list_id).order('position', { ascending: true });
    if (error) throw error;
    return data as ListItem[];
};

export const updateListItemPosition = async (list_id: string, imdb_id: string, position: number) => {
    if (isLocalModeActive()) {
        const items = readLocal<ListItem[]>(LOCAL_LIST_ITEMS_KEY, []);
        const updated = items.map((item) =>
            item.list_id === list_id && item.imdb_id === imdb_id
                ? { ...item, position }
                : item,
        );
        writeLocal(LOCAL_LIST_ITEMS_KEY, updated);
        return;
    }
    const { error } = await supabase.from('list_items').update({ position }).eq('list_id', list_id).eq('imdb_id', imdb_id);
    if (error) throw error;
};

export const updateListItemPoster = async (list_id: string, imdb_id: string, poster: string) => {
    if (isLocalModeActive()) {
        const items = readLocal<ListItem[]>(LOCAL_LIST_ITEMS_KEY, []);
        const updated = items.map((item) =>
            item.list_id === list_id && item.imdb_id === imdb_id
                ? { ...item, poster }
                : item,
        );
        writeLocal(LOCAL_LIST_ITEMS_KEY, updated);
        return;
    }
    const { error } = await supabase.from('list_items').update({ poster }).eq('list_id', list_id).eq('imdb_id', imdb_id);
    if (error) throw error;
};

// Watch Parties
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

export const createWatchParty = async (
    imdbId: string,
    streamSource: string,
    season: number | null = null,
    episode: number | null = null,
    fileIdx: number | null = null
) => {
    const user = getCachedUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
        .from('watch_parties')
        .insert({
            host_user_id: user.id,
            imdb_id: imdbId,
            season,
            episode,
            stream_source: streamSource,
            file_idx: fileIdx,
        })
        .select()
        .single();

    if (error) throw error;
    return data as WatchParty;
};

export const joinWatchParty = async (partyId: string) => {
    const user = getCachedUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase.from('watch_party_members').insert({
        party_id: partyId,
        user_id: user.id,
    });

    if (error) throw error;
};

export const leaveWatchParty = async (partyId: string) => {
    const user = getCachedUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
        .from('watch_party_members')
        .delete()
        .eq('party_id', partyId)
        .eq('user_id', user.id);

    if (error) throw error;
};

export const updateWatchPartyState = async (
    partyId: string,
    currentTimeSeconds: number,
    isPlaying: boolean
) => {
    const user = getCachedUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
        .from('watch_parties')
        .update({
            current_time_seconds: currentTimeSeconds,
            is_playing: isPlaying,
            last_update: new Date().toISOString(),
        })
        .eq('party_id', partyId)
        .eq('host_user_id', user.id); // Only host can update

    if (error) throw error;
};

export const getWatchParty = async (partyId: string) => {
    const { data, error } = await supabase
        .from('watch_parties')
        .select('*')
        .eq('party_id', partyId)
        .single();

    if (error) throw error;
    return data as WatchParty;
};

export const getActiveWatchParties = async () => {
    const { data, error } = await supabase
        .from('watch_parties')
        .select('*')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data as WatchParty[];
};

export const updateMemberLastSeen = async (partyId: string) => {
    const user = getCachedUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
        .from('watch_party_members')
        .update({ last_seen: new Date().toISOString() })
        .eq('party_id', partyId)
        .eq('user_id', user.id);

    if (error) throw error;
};

export const getWatchPartyMembers = async (partyId: string) => {
    const { data, error } = await supabase
        .from('watch_party_members')
        .select('*')
        .eq('party_id', partyId)
        .order('joined_at', { ascending: true });

    if (error) throw error;
    return data as WatchPartyMember[];
};
