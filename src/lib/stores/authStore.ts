import { writable } from 'svelte/store';
import { supabase } from '../db/supabase';
import type { User } from '@supabase/supabase-js';

export const currentUser = writable<User | null>(null);

let userCache: User | null = null;
let initialized = false;

export async function initAuth() {
    if (initialized) return;
    initialized = true;

    const { data: { session } } = await supabase.auth.getSession();
    userCache = session?.user ?? null;
    currentUser.set(userCache);

    supabase.auth.onAuthStateChange((event, session) => {
        userCache = session?.user ?? null;
        currentUser.set(userCache);
    });
}

export function getCachedUser(): User | null {
    return userCache;
}
