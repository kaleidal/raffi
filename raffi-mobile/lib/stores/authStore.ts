import type { User } from '@supabase/supabase-js';
import { create } from 'zustand';
import { setCachedUser } from '../db';
import { supabase } from '../supabase';

interface AuthState {
  user: User | null;
  loading: boolean;
  initialized: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  initAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: false,
  initialized: false,

  initAuth: async () => {
    if (get().initialized) return;

    set({ loading: true });

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const user = session?.user ?? null;
    setCachedUser(user);
    set({ user, loading: false, initialized: true });

    // Listen for auth changes
    supabase.auth.onAuthStateChange((event, session) => {
      const user = session?.user ?? null;
      setCachedUser(user);
      set({ user });
    });
  },

  signIn: async (email: string, password: string) => {
    set({ loading: true });
    const { error, data } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (!error && data.user) {
      setCachedUser(data.user);
      set({ user: data.user });
    }
    set({ loading: false });
    return { error };
  },

  signUp: async (email: string, password: string) => {
    set({ loading: true });
    const { error, data } = await supabase.auth.signUp({
      email,
      password,
    });
    if (!error && data.user) {
      setCachedUser(data.user);
      set({ user: data.user });
    }
    set({ loading: false });
    return { error };
  },

  signOut: async () => {
    set({ loading: true });
    await supabase.auth.signOut();
    setCachedUser(null);
    set({ user: null, loading: false });
  },
}));
