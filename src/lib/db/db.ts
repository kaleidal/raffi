import { supabase } from './supabase';

export interface Addon {
    user_id: string;
    added_at: string;
    transport_url: string;
    manifest: any;
    flags: any;
}

export interface LibraryItem {
    user_id: string;
    imdb_id: string;
    progress: any; // Record<string, WatchedState>
    last_watched: string;
    completed_at: string | null;
}

export interface List {
    list_id: string;
    user_id: string;
    created_at: string;
    name: string;
}

export interface ListItem {
    list_id: string;
    imdb_id: string;
    position: number;
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
    const { data: { user } } = await supabase.auth.getUser();
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase.from('addons').delete().eq('user_id', user.id).eq('transport_url', transport_url);
    if (error) throw error;
};

// Library
export const getLibrary = async () => {
    const { data, error } = await supabase.from('libraries').select('*');
    if (error) throw error;
    return data as LibraryItem[];
};

export const getLibraryItem = async (imdb_id: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase.from('libraries').select('*').eq('user_id', user.id).eq('imdb_id', imdb_id).maybeSingle();
    if (error) throw error;
    return data as LibraryItem | null;
};

export const updateLibraryProgress = async (imdb_id: string, progress: any, completed: boolean = false) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const updates: any = {
        user_id: user.id,
        imdb_id,
        progress,
        last_watched: new Date().toISOString(),
    };
    if (completed) {
        updates.completed_at = new Date().toISOString();
    }

    // Check if item exists
    const { data: existing } = await supabase
        .from('libraries')
        .select('id')
        .eq('user_id', user.id)
        .eq('imdb_id', imdb_id)
        .maybeSingle();

    if (existing) {
        const { data, error } = await supabase
            .from('libraries')
            .update(updates)
            .eq('user_id', user.id)
            .eq('imdb_id', imdb_id)
            .select()
            .single();
        if (error) throw error;
        return data as LibraryItem;
    } else {
        const { data, error } = await supabase
            .from('libraries')
            .insert(updates)
            .select()
            .single();
        if (error) throw error;
        return data as LibraryItem;
    }
};

// Lists
export const getLists = async () => {
    const { data, error } = await supabase.from('lists').select('*');
    if (error) throw error;
    return data as List[];
};

export const createList = async (name: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase.from('lists').insert({
        user_id: user.id,
        name,
        created_at: new Date().toISOString()
    }).select().single();
    if (error) throw error;
    return data as List;
};

export const deleteList = async (list_id: string) => {
    const { error } = await supabase.from('lists').delete().eq('list_id', list_id);
    if (error) throw error;
};

export const addToList = async (list_id: string, imdb_id: string, position: number) => {
    const { error } = await supabase.from('list_items').insert({
        list_id,
        imdb_id,
        position
    });
    if (error) throw error;
};

export const removeFromList = async (list_id: string, imdb_id: string) => {
    const { error } = await supabase.from('list_items').delete().eq('list_id', list_id).eq('imdb_id', imdb_id);
    if (error) throw error;
};
