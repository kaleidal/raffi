import { writable } from 'svelte/store';
import { supabase } from '../db/supabase';
import type { User } from '@supabase/supabase-js';
import { ensureDefaultAddonsForUser } from '../db/db';

export const currentUser = writable<User | null>(null);

let userCache: User | null = null;
let initialized = false;
let seededUserId: string | null = null;

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

    const { data: { session } } = await supabase.auth.getSession();
    userCache = session?.user ?? null;
    currentUser.set(userCache);
    await seedDefaultsIfNeeded(userCache);

    supabase.auth.onAuthStateChange((event, session) => {
        userCache = session?.user ?? null;
        currentUser.set(userCache);

        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
            seedDefaultsIfNeeded(userCache).catch(() => {
                // ignore
            });
        }
    });
}

export function getCachedUser(): User | null {
    return userCache;
}
