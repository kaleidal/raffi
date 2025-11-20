import { writable } from 'svelte/store';
import type { User } from '@supabase/supabase-js';

export interface LibraryTitleState {
    imdbId: string;
    lastWatched?: string; // ISO
    progress?: Record<string, unknown>;
    completedAt?: string; // ISO
}

export interface UserMeta {
    addons: Record<string, unknown>;
    settings: Record<string, unknown>;
    lists: string[];
    library: Record<string, LibraryTitleState>;
}

export interface SessionStore {
    user: User | null;
    meta: UserMeta | null;
}

export const session = writable<SessionStore>({
    user: null,
    meta: null
});