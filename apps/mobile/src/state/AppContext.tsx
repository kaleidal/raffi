import { fetchManifest, mergeLists, mergeProgress, type AddonConfig, type MediaMeta, type RaffiList, type WatchProgress } from '@raffi/shared';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PairedDesktop } from '@/lib/bridge';
import { readJson, readSecret, writeJson, writeSecret } from '@/lib/storage';
import { fetchRemoteState, pushAddon, pushList, pushProgress } from '@/lib/sync';

export type AppUser = { id: string; name?: string | null; email?: string | null; token: string };

type AppState = {
  ready: boolean;
  addons: AddonConfig[];
  progress: WatchProgress[];
  lists: RaffiList[];
  desktops: PairedDesktop[];
  user: AppUser | null;
  addAddon(url: string): Promise<void>;
  removeAddon(url: string): Promise<void>;
  saveProgress(item: WatchProgress): Promise<void>;
  createList(name: string): Promise<RaffiList>;
  addToList(listId: string, item: MediaMeta): Promise<void>;
  addDesktop(desktop: PairedDesktop, token: string): Promise<void>;
  removeDesktop(id: string): Promise<void>;
  getDesktopToken(id: string): Promise<string | null>;
  setUser(user: AppUser | null): Promise<void>;
  sync(): Promise<void>;
};

const Context = createContext<AppState | null>(null);

export function AppProvider({ children }: React.PropsWithChildren) {
  const [ready, setReady] = useState(false);
  const [addons, setAddons] = useState<AddonConfig[]>([]);
  const [progress, setProgress] = useState<WatchProgress[]>([]);
  const [lists, setLists] = useState<RaffiList[]>([]);
  const [desktops, setDesktops] = useState<PairedDesktop[]>([]);
  const [user, setUserState] = useState<AppUser | null>(null);

  useEffect(() => { void (async () => {
    const [storedAddons, storedProgress, storedLists, storedDesktops, storedUser] = await Promise.all([
      readJson<AddonConfig[]>('addons', []), readJson<WatchProgress[]>('progress', []), readJson<RaffiList[]>('lists', []),
      readJson<PairedDesktop[]>('desktops', []), readJson<AppUser | null>('user', null),
    ]);
    setAddons(storedAddons); setProgress(storedProgress); setLists(storedLists); setDesktops(storedDesktops); setUserState(storedUser); setReady(true);
  })(); }, []);

  const sync = useCallback(async () => {
    if (!user?.token) return;
    const remote = await fetchRemoteState(user.token);
    const nextAddons = [...new Map([...remote.addons, ...addons].map((addon) => [addon.transportUrl, addon])).values()];
    const nextProgress = mergeProgress(progress, remote.progress);
    const nextLists = mergeLists(lists, remote.lists);
    setAddons(nextAddons); setProgress(nextProgress); setLists(nextLists);
    await Promise.all([writeJson('addons', nextAddons), writeJson('progress', nextProgress), writeJson('lists', nextLists)]);
    await Promise.allSettled(addons.filter((addon) => !remote.addons.some((other) => other.transportUrl === addon.transportUrl)).map((addon) => pushAddon(user.token, addon)));
  }, [addons, lists, progress, user]);

  const value = useMemo<AppState>(() => ({
    ready, addons, progress, lists, desktops, user,
    async addAddon(url) {
      const addon = await fetchManifest(url);
      const next = [...addons.filter((item) => item.transportUrl !== addon.transportUrl), addon];
      setAddons(next); await writeJson('addons', next); if (user) await pushAddon(user.token, addon);
    },
    async removeAddon(url) { const next = addons.filter((addon) => addon.transportUrl !== url); setAddons(next); await writeJson('addons', next); },
    async saveProgress(item) {
      const next = mergeProgress([item], progress); setProgress(next); await writeJson('progress', next); if (user) await pushProgress(user.token, item);
    },
    async createList(name) {
      const remote = user ? await pushList(user.token, name) : null;
      const list: RaffiList = { id: remote?.id ?? crypto.randomUUID(), name: name.trim(), position: remote?.position ?? lists.length, items: [], updatedAt: new Date().toISOString() };
      const next = [...lists, list]; setLists(next); await writeJson('lists', next); return list;
    },
    async addToList(listId, item) {
      const next = lists.map((list) => list.id !== listId || list.items.some((entry) => entry.imdbId === item.imdbId) ? list : { ...list, updatedAt: new Date().toISOString(), items: [...list.items, { imdbId: item.imdbId, type: item.type, poster: item.poster, position: list.items.length }] });
      setLists(next); await writeJson('lists', next);
    },
    async addDesktop(desktop, token) {
      const next = [...desktops.filter((item) => item.id !== desktop.id), desktop]; setDesktops(next); await Promise.all([writeJson('desktops', next), writeSecret(`desktop:${desktop.id}`, token)]);
    },
    async removeDesktop(id) { const next = desktops.filter((desktop) => desktop.id !== id); setDesktops(next); await Promise.all([writeJson('desktops', next), writeSecret(`desktop:${id}`, null)]); },
    getDesktopToken: (id) => readSecret(`desktop:${id}`),
    async setUser(nextUser) { setUserState(nextUser); await writeJson('user', nextUser); },
    sync,
  }), [addons, desktops, lists, progress, ready, sync, user]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useApp() {
  const context = useContext(Context);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
}
