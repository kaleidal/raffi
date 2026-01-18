import { supabase } from './supabase';
import type { Addon, LibraryItem, List, ListItem } from './types';

let cachedUser: any = null;

export const setCachedUser = (user: any) => {
  cachedUser = user;
};

export const getCachedUser = () => cachedUser;

// Addons
export const getAddons = async () => {
  const user = getCachedUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('addons')
    .select('*')
    .eq('user_id', user.id)
    .order('added_at', { ascending: false });
  if (error) throw error;
  return data as Addon[];
};

export const addAddon = async (addon: Omit<Addon, 'user_id' | 'added_at'>) => {
  const user = getCachedUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('addons')
    .insert({
      user_id: user.id,
      added_at: new Date().toISOString(),
      ...addon,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Addon;
};

export const removeAddon = async (transport_url: string) => {
  const user = getCachedUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('addons')
    .delete()
    .eq('user_id', user.id)
    .eq('transport_url', transport_url);
  if (error) throw error;
};

// Library
export const getLibrary = async (limit: number = 100, offset: number = 0) => {
  const user = getCachedUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('libraries')
    .select('*')
    .eq('user_id', user.id)
    .order('last_watched', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return data as LibraryItem[];
};

export const getLibraryItem = async (imdb_id: string) => {
  const user = getCachedUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('libraries')
    .select('*')
    .eq('user_id', user.id)
    .eq('imdb_id', imdb_id)
    .maybeSingle();
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
  poster?: string
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
  const user = getCachedUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('lists')
    .select('*')
    .eq('user_id', user.id)
    .order('position', { ascending: true });
  if (error) throw error;
  return data as List[];
};

export const getListItems = async (list_id: string) => {
  const { data, error } = await supabase
    .from('list_items')
    .select('*')
    .eq('list_id', list_id)
    .order('position', { ascending: true });
  if (error) throw error;
  return data as ListItem[];
};

export const createList = async (name: string) => {
  const user = getCachedUser();
  if (!user) throw new Error('Not authenticated');

  const lists = await getLists();
  const position = lists.length;

  const { data, error } = await supabase
    .from('lists')
    .insert({
      user_id: user.id,
      name,
      position,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  return data as List;
};

export const addToList = async (
  list_id: string,
  imdb_id: string,
  type: string,
  poster?: string
) => {
  const items = await getListItems(list_id);
  const exists = items.find((i) => i.imdb_id === imdb_id);
  if (exists) return exists;

  const position = items.length;

  const { data, error } = await supabase
    .from('list_items')
    .insert({
      list_id,
      imdb_id,
      type,
      position,
      poster,
    })
    .select()
    .single();
  if (error) throw error;
  return data as ListItem;
};

export const removeFromList = async (list_id: string, imdb_id: string) => {
  const { error } = await supabase
    .from('list_items')
    .delete()
    .eq('list_id', list_id)
    .eq('imdb_id', imdb_id);
  if (error) throw error;
};
