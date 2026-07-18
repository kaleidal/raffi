import type { AddonConfig, RaffiList, WatchProgress } from '@raffi/shared';

const BASE_URL = (process.env.EXPO_PUBLIC_RAFFI_SYNC_URL || 'https://sync.raffi.al').replace(/\/+$/, '');

type RemoteState = {
  addons?: { transport_url: string; manifest: AddonConfig['manifest'] }[];
  library?: { imdb_id: string; type: 'movie' | 'series'; progress: any; poster?: string; last_watched?: string }[];
  lists?: { id: string; name: string; position: number; updated_at?: string }[];
  listItems?: { list_id: string; imdb_id: string; type: 'movie' | 'series'; poster?: string; position: number }[];
};

async function request<T>(token: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { accept: 'application/json', authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Raffi Sync request failed (${response.status})`);
  return response.json() as Promise<T>;
}

export async function fetchRemoteState(token: string) {
  const state = await request<RemoteState>(token, '/state');
  const lists: RaffiList[] = (state.lists ?? []).map((list) => ({
    id: list.id,
    name: list.name,
    position: list.position,
    updatedAt: list.updated_at ?? new Date(0).toISOString(),
    items: (state.listItems ?? []).filter((item) => item.list_id === list.id).map((item) => ({ imdbId: item.imdb_id, type: item.type, poster: item.poster, position: item.position })),
  }));
  const progress: WatchProgress[] = (state.library ?? []).map((item) => ({
    imdbId: item.imdb_id,
    type: item.type,
    positionSeconds: Number(item.progress?.currentTimeSeconds ?? item.progress?.positionSeconds ?? 0),
    durationSeconds: Number(item.progress?.durationSeconds ?? 0),
    season: item.progress?.season,
    episode: item.progress?.episode,
    poster: item.poster,
    updatedAt: item.last_watched ?? new Date(0).toISOString(),
  }));
  return {
    addons: (state.addons ?? []).map((addon) => ({ transportUrl: addon.transport_url, manifest: addon.manifest })),
    lists,
    progress,
  };
}

export const pushAddon = (token: string, addon: AddonConfig) => request(token, '/addons', { addon: { transport_url: addon.transportUrl, addon_id: addon.manifest.id, manifest: addon.manifest, flags: {} } });
export const pushProgress = (token: string, item: WatchProgress) => request(token, '/library/progress', {
  imdb_id: item.imdbId,
  type: item.type,
  poster: item.poster,
  completed: item.durationSeconds > 0 && item.positionSeconds / item.durationSeconds >= 0.92,
  progress: { currentTimeSeconds: item.positionSeconds, durationSeconds: item.durationSeconds, season: item.season, episode: item.episode },
});
export const pushList = (token: string, name: string) => request<{ id: string; name: string; position: number }>(token, '/lists/create', { name });
