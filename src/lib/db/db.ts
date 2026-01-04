import { supabase } from './supabase';
import { getCachedUser } from '../stores/authStore';

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

export const ensureDefaultAddonsForUser = async (userId: string) => {
    if (!userId) return;

    const transportUrl = "https://opensubtitles-v3.strem.io";
    const manifest = {
        id: "org.stremio.opensubtitlesv3",
        logo: "http://www.strem.io/images/addons/opensubtitles-logo.png",
        name: "OpenSubtitles v3",
        types: ["movie", "series"],
        version: "1.0.0",
        catalogs: [],
        resources: ["subtitles"],
        idPrefixes: ["tt"],
        description: "OpenSubtitles v3 Addon for Stremio",
    };

    try {
        const { data, error } = await supabase
            .from("addons")
            .select("transport_url")
            .eq("user_id", userId)
            .eq("transport_url", transportUrl)
            .maybeSingle();
        if (error) throw error;
        if (data) return;

        const { error: insertError } = await supabase.from("addons").insert({
            user_id: userId,
            transport_url: transportUrl,
            manifest,
            flags: { protected: false, official: false },
        });
        if (insertError) throw insertError;
    } catch (e) {
        console.warn("Failed to seed default addons", e);
    }
};

// Addons
export const getAddons = async () => {
    const { data, error } = await supabase.from('addons').select('*');
    if (error) throw error;
    return data as Addon[];
};

export const addAddon = async (addon: Omit<Addon, 'user_id' | 'added_at'>) => {
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
    const user = getCachedUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase.from('addons').delete().eq('user_id', user.id).eq('transport_url', transport_url);
    if (error) throw error;
};

// Library
export const getLibrary = async (limit: number = 100, offset: number = 0) => {
    const { data, error } = await supabase
        .from('libraries')
        .select('*')
        .order('last_watched', { ascending: false })
        .range(offset, offset + limit - 1);
    if (error) throw error;
    return data as LibraryItem[];
};

export const getLibraryItem = async (imdb_id: string) => {
    const user = getCachedUser();
    if (!user) return null;

    const { data, error } = await supabase.from('libraries').select('*').eq('user_id', user.id).eq('imdb_id', imdb_id).maybeSingle();
    if (error) throw error;
    return data as LibraryItem | null;
};

export const hideFromContinueWatching = async (imdb_id: string) => {
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
    const { data, error } = await supabase.from('lists').select('*').order('position', { ascending: true });
    if (error) throw error;
    return data as List[];
};

// Get lists with their items in a single query (more efficient)
export const getListsWithItems = async () => {
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
    const { error } = await supabase.from('lists').update(updates).eq('list_id', list_id);
    if (error) throw error;
};

export const deleteList = async (list_id: string) => {
    const { error } = await supabase.from('lists').delete().eq('list_id', list_id);
    if (error) throw error;
};

export const addToList = async (list_id: string, imdb_id: string, position: number, type: string, poster?: string) => {
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
    const { error } = await supabase.from('list_items').delete().eq('list_id', list_id).eq('imdb_id', imdb_id);
    if (error) throw error;
};

export const getListItems = async (list_id: string) => {
    const { data, error } = await supabase.from('list_items').select('*').eq('list_id', list_id).order('position', { ascending: true });
    if (error) throw error;
    return data as ListItem[];
};

export const updateListItemPosition = async (list_id: string, imdb_id: string, position: number) => {
    const { error } = await supabase.from('list_items').update({ position }).eq('list_id', list_id).eq('imdb_id', imdb_id);
    if (error) throw error;
};

export const updateListItemPoster = async (list_id: string, imdb_id: string, poster: string) => {
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
