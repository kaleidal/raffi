import { supabase } from '../db/supabase';
import type { User } from '@supabase/supabase-js';
import { ensureDefaultAddonsForUser, ensureDefaultAddonsForLocal, syncLocalStateToUser, hasLocalState } from '../db/db';
import { writable, get } from 'svelte/store';

export type UpdateStatus = {
    available: boolean;
    downloaded: boolean;
    version: string | null;
    notes: string;
    releaseDate: string | null;
};

export const currentUser = writable<User | null>(null);
export const localMode = writable(false);
export const updateStatus = writable<UpdateStatus>({
    available: false,
    downloaded: false,
    version: null,
    notes: "",
    releaseDate: null,
});

const LOCAL_MODE_KEY = 'local_mode_enabled';

let userCache: User | null = null;
let initialized = false;
let seededUserId: string | null = null;

const readLocalMode = () => {
    if (typeof window === 'undefined') return false;
    try {
        return localStorage.getItem(LOCAL_MODE_KEY) === 'true';
    } catch {
        return false;
    }
};

const persistLocalMode = (enabled: boolean) => {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(LOCAL_MODE_KEY, String(enabled));
    } catch {
        // ignore
    }
};

export const enableLocalMode = () => {
    localMode.set(true);
    persistLocalMode(true);
    ensureDefaultAddonsForLocal().catch(() => {
        // ignore
    });
};

export const disableLocalMode = () => {
    localMode.set(false);
    persistLocalMode(false);
};

async function seedDefaultsIfNeeded(user: User | null) {
    const userId = user?.id;
    if (!userId) return;
    if (seededUserId === userId) return;
    seededUserId = userId;
    await ensureDefaultAddonsForUser(userId);
}

export async function initAuth() {
    if (initialized) return;
    initialized = true;

    const storedLocalMode = readLocalMode();
    // Enable local mode by default if not explicitly set
    const shouldUseLocalMode = storedLocalMode !== false && localStorage.getItem(LOCAL_MODE_KEY) === null 
        ? true 
        : storedLocalMode;
    
    localMode.set(shouldUseLocalMode);
    if (shouldUseLocalMode) {
        persistLocalMode(true);
    }

    const { data: { session } } = await supabase.auth.getSession();
    userCache = session?.user ?? null;
    currentUser.set(userCache);

    if (userCache) {
        if (hasLocalState()) {
            await syncLocalStateToUser(userCache.id);
        }
        disableLocalMode();
        await seedDefaultsIfNeeded(userCache);
    } else if (shouldUseLocalMode) {
        await ensureDefaultAddonsForLocal();
    }

    supabase.auth.onAuthStateChange((event, session) => {
        userCache = session?.user ?? null;
        currentUser.set(userCache);

        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
            if (userCache?.id && hasLocalState()) {
                syncLocalStateToUser(userCache.id).catch(() => {
                    // ignore
                });
            }
            disableLocalMode();
            seedDefaultsIfNeeded(userCache).catch(() => {
                // ignore
            });
        }

        if (event === 'SIGNED_OUT' && get(localMode)) {
            ensureDefaultAddonsForLocal().catch(() => {
                // ignore
            });
        }
    });
}

export function getCachedUser(): User | null {
    return userCache;
}
