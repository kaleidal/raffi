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

export const updateLibraryProgress = async (imdb_id: string, progress: any, type: string, completed: boolean = false, poster?: string) => {
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
    if (completed) {
        updates.completed_at = new Date().toISOString();
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
