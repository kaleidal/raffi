import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import type { AppUser } from '@/lib/auth/types';
import { signInWithAve } from '@/lib/auth/aveAuth';
import { setConvexAuthToken } from '@/lib/convex';
import { setCachedUser } from '@/lib/db';

const AVE_USER_KEY = 'ave_user_mobile';
const AVE_TOKEN_KEY = 'ave_token_mobile';

interface AuthState {
  user: AppUser | null;
  loading: boolean;
  initialized: boolean;
  signIn: () => Promise<{ error: any }>;
  signUp: () => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  initAuth: () => Promise<void>;
}

const persistSession = async (user: AppUser | null) => {
  if (!user) {
    await Promise.all([AsyncStorage.removeItem(AVE_USER_KEY), AsyncStorage.removeItem(AVE_TOKEN_KEY)]);
    return;
  }
  await Promise.all([
    AsyncStorage.setItem(
      AVE_USER_KEY,
      JSON.stringify({
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        provider: user.provider,
      })
    ),
    AsyncStorage.setItem(AVE_TOKEN_KEY, user.token),
  ]);
};

const readSession = async (): Promise<AppUser | null> => {
  const [userRaw, token] = await Promise.all([
    AsyncStorage.getItem(AVE_USER_KEY),
    AsyncStorage.getItem(AVE_TOKEN_KEY),
  ]);
  if (!userRaw || !token) return null;

  try {
    const parsed = JSON.parse(userRaw);
    if (!parsed?.id) return null;
    return {
      id: String(parsed.id),
      email: parsed.email ?? null,
      name: parsed.name ?? null,
      avatar: parsed.avatar ?? null,
      provider: 'ave',
      token,
    };
  } catch {
    return null;
  }
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: false,
  initialized: false,

  initAuth: async () => {
    if (get().initialized) return;

    set({ loading: true });
    const user = await readSession();
    if (user?.token) {
      setConvexAuthToken(user.token);
    }
    setCachedUser(user);
    set({ user, loading: false, initialized: true });
  },

  signIn: async () => {
    set({ loading: true });
    try {
      const user = await signInWithAve();
      setConvexAuthToken(user.token);
      setCachedUser(user);
      await persistSession(user);
      set({ user, loading: false });
      return { error: null };
    } catch (error: any) {
      set({ loading: false });
      return { error };
    }
  },

  signUp: async () => {
    return get().signIn();
  },

  signOut: async () => {
    set({ loading: true });
    setConvexAuthToken(null);
    setCachedUser(null);
    await persistSession(null);
    set({ user: null, loading: false });
  },
}));
