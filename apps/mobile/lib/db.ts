import type { AppUser } from './auth/types';
import { syncGet, syncPost } from './raffiSync';
import type { Addon, LibraryItem, List, ListItem } from './types';

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
  action: 'start' | 'pause' | 'stop';
  imdbId: string;
  mediaType: 'movie' | 'episode';
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

let cachedUser: AppUser | null = null;

let remoteStateCache: { userId: string; data: RemoteState; updatedAt: number } | null = null;
const CACHE_TTL_MS = 15000;

export const setCachedUser = (user: AppUser | null) => {
  cachedUser = user;
  if (!user) {
    remoteStateCache = null;
  }
};

export const getCachedUser = () => cachedUser;

const requireUserId = () => {
  const user = getCachedUser();
  if (!user?.id) throw new Error('Not authenticated');
  return user.id;
};

const invalidateRemoteCache = () => {
  remoteStateCache = null;
};

const getRemoteState = async (force = false): Promise<RemoteState> => {
  const userId = requireUserId();
  const now = Date.now();
  if (
    !force &&
    remoteStateCache &&
    remoteStateCache.userId === userId &&
    now - remoteStateCache.updatedAt < CACHE_TTL_MS
  ) {
    return remoteStateCache.data;
  }

  const data = await syncGet<RemoteState>('/state');
  const normalized: RemoteState = {
    addons: data?.addons || [],
    library: data?.library || [],
    lists: data?.lists || [],
    listItems: data?.listItems || [],
  };
  remoteStateCache = { userId, data: normalized, updatedAt: now };
  return normalized;
};

export const getAddons = async () => {
  const user = getCachedUser();
  if (!user) return [];
  const state = await getRemoteState();
  return [...state.addons].sort((a, b) => (b.added_at || '').localeCompare(a.added_at || ''));
};

export const addAddon = async (addon: Omit<Addon, 'user_id' | 'added_at'>) => {
  requireUserId();
  const data = await syncPost<Addon>('/addons', { addon });
  invalidateRemoteCache();
  return data;
};

export const removeAddon = async (transport_url: string) => {
  requireUserId();
  await syncPost('/addons/remove', { transport_url });
  invalidateRemoteCache();
};

export const getLibrary = async (limit: number = 100, offset: number = 0) => {
  const user = getCachedUser();
  if (!user) return [];
  const state = await getRemoteState();
  const sorted = [...state.library].sort((a, b) => (b.last_watched || '').localeCompare(a.last_watched || ''));
  return sorted.slice(offset, offset + limit);
};

export const getLibraryItem = async (imdb_id: string) => {
  const user = getCachedUser();
  if (!user) return null;
  const state = await getRemoteState();
  return state.library.find((item) => item.imdb_id === imdb_id) ?? null;
};

export const hideFromContinueWatching = async (imdb_id: string) => {
  requireUserId();
  await syncPost('/library/hide', { imdb_id });
  invalidateRemoteCache();
};

export const forgetProgress = async (imdb_id: string) => {
  requireUserId();
  await syncPost('/library/forget', { imdb_id });
  invalidateRemoteCache();
};

export const updateLibraryProgress = async (
  imdb_id: string,
  progress: any,
  type: string,
  completed?: boolean,
  poster?: string
) => {
  requireUserId();
  const data = await syncPost<LibraryItem>('/library/progress', { imdb_id,
    progress,
    type,
    completed,
    poster,
  });
  invalidateRemoteCache();
  return data;
};

export const updateLibraryPoster = async (imdb_id: string, poster: string) => {
  requireUserId();
  await syncPost('/library/poster', { imdb_id, poster });
  invalidateRemoteCache();
};

export const getTraktStatus = async (): Promise<TraktStatus> => {
  requireUserId();
  const status = await syncGet<TraktStatus>('/trakt/status');
  return status;
};

export const exchangeTraktCode = async (code: string) => {
  requireUserId();
  return syncPost('/trakt/exchange-code', { code });
};

export const disconnectTrakt = async () => {
  requireUserId();
  return syncPost('/trakt/disconnect', {});
};

export const refreshTraktToken = async () => {
  requireUserId();
  return syncPost('/trakt/refresh', {});
};

export const traktScrobble = async (args: TraktScrobbleArgs) => {
  requireUserId();
  return syncPost('/trakt/scrobble', args as any);
};

export const getLists = async () => {
  const user = getCachedUser();
  if (!user) return [];
  const state = await getRemoteState();
  return [...state.lists].sort((a, b) => a.position - b.position);
};

export const getListItems = async (list_id: string) => {
  const state = await getRemoteState();
  return state.listItems.filter((item) => item.list_id === list_id).sort((a, b) => a.position - b.position);
};

export const createList = async (name: string) => {
  requireUserId();
  const data = await syncPost<List>('/lists/create', { name });
  invalidateRemoteCache();
  return data;
};

export const addToList = async (
  list_id: string,
  imdb_id: string,
  type: string,
  poster?: string
) => {
  requireUserId();
  const items = await getListItems(list_id);
  const exists = items.find((i) => i.imdb_id === imdb_id);
  if (exists) return exists;

  const position = items.length;
  const item = await syncPost<ListItem>('/lists/items/add', { list_id,
    imdb_id,
    position,
    type,
    poster,
  });
  invalidateRemoteCache();
  return item;
};

export const removeFromList = async (list_id: string, imdb_id: string) => {
  requireUserId();
  await syncPost('/lists/items/remove', { list_id, imdb_id });
  invalidateRemoteCache();
};
