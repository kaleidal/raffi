import { create } from 'zustand';
import { getCachedMetaData } from '../api';
import {
    forgetProgress,
    getLibrary,
    hideFromContinueWatching,
    updateLibraryProgress
} from '../db';
import type { LibraryItem, ShowResponse } from '../types';

export interface LibraryItemWithMeta extends LibraryItem {
  meta?: ShowResponse;
}

interface LibraryState {
  items: LibraryItemWithMeta[];
  loading: boolean;
  error: string | null;
  fetchLibrary: () => Promise<void>;
  getItemProgress: (imdbId: string) => LibraryItem | undefined;
  updateProgress: (
    imdbId: string,
    progress: any,
    type: string,
    completed?: boolean,
    poster?: string
  ) => Promise<void>;
  hideItem: (imdbId: string) => Promise<void>;
  removeItem: (imdbId: string) => Promise<void>;
  clearLibrary: () => Promise<void>;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  items: [],
  loading: false,
  error: null,

  fetchLibrary: async () => {
    set({ loading: true, error: null });
    try {
      const library = await getLibrary();
      const sortedLibrary = library
        .filter((item) => item.shown !== false && !item.completed_at)
        .sort(
          (a, b) =>
            new Date(b.last_watched).getTime() - new Date(a.last_watched).getTime()
        );

      // Load metadata for items
      const itemsWithMeta: LibraryItemWithMeta[] = [];
      for (const item of sortedLibrary.slice(0, 20)) {
        try {
          const type = item.type || 'movie';
          const meta = await getCachedMetaData(item.imdb_id, type);
          itemsWithMeta.push({ ...item, meta });
        } catch (e) {
          itemsWithMeta.push(item);
        }
      }

      set({ items: itemsWithMeta, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  getItemProgress: (imdbId: string) => {
    return get().items.find((item) => item.imdb_id === imdbId);
  },

  updateProgress: async (
    imdbId: string,
    progress: any,
    type: string,
    completed?: boolean,
    poster?: string
  ) => {
    try {
      await updateLibraryProgress(imdbId, progress, type, completed, poster);

      // Best-effort: ensure we have a title/poster immediately
      let meta: ShowResponse | undefined;
      try {
        meta = await getCachedMetaData(imdbId, type || 'movie');
      } catch {
        meta = undefined;
      }

      set((state) => {
        const existingIdx = state.items.findIndex((i) => i.imdb_id === imdbId);
        const now = new Date().toISOString();
        const baseItem =
          existingIdx >= 0
            ? state.items[existingIdx]
            : ({
                user_id: 'unknown',
                imdb_id: imdbId,
                progress: null,
                last_watched: now,
                completed_at: null,
                type,
                shown: true,
              } as any);

        const updated = {
          ...baseItem,
          progress,
          type,
          poster: poster || baseItem.poster,
          meta: baseItem.meta || meta,
          last_watched: now,
          completed_at: completed ? now : baseItem.completed_at,
          shown: true,
        };

        if (existingIdx >= 0) {
          const next = [...state.items];
          next[existingIdx] = updated;
          return { items: next };
        }

        return { items: [updated, ...state.items] };
      });
    } catch (e: any) {
      console.error('Failed to update progress:', e);
    }
  },

  hideItem: async (imdbId: string) => {
    try {
      await hideFromContinueWatching(imdbId);
      set((state) => ({
        items: state.items.filter((item) => item.imdb_id !== imdbId),
      }));
    } catch (e: any) {
      console.error('Failed to hide item:', e);
    }
  },

  removeItem: async (imdbId: string) => {
    try {
      await forgetProgress(imdbId);
      set((state) => ({
        items: state.items.filter((item) => item.imdb_id !== imdbId),
      }));
    } catch (e: any) {
      console.error('Failed to remove item:', e);
    }
  },

  clearLibrary: async () => {
    try {
      const { items } = get();
      // Remove all items one by one
      for (const item of items) {
        await forgetProgress(item.imdb_id);
      }
      set({ items: [] });
    } catch (e: any) {
      console.error('Failed to clear library:', e);
      throw e;
    }
  },
}));
