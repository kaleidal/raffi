import type { AppUser } from "../auth/types";
import { refreshAveUserSession, signInWithAveViaBrowser } from "../auth/aveAuth";
import {
    ensureDefaultAddonsForUser,
    ensureDefaultAddonsForLocal,
    syncLocalStateToUser,
    hasLocalState,
} from "../db/db";
import {
    hasLegacySupabaseSession,
    importLegacySupabaseSessionToLocal,
    clearLegacySupabaseSession,
} from "../db/supabaseLegacy";
import { convexQuery, setConvexAuthToken } from "../db/convex";
import { writable } from "svelte/store";

export type UpdateStatus = {
    available: boolean;
    downloaded: boolean;
    version: string | null;
    notes: string;
    releaseDate: string | null;
};

export const currentUser = writable<AppUser | null>(null);
export const localMode = writable(false);
export const legacyMigrationNeeded = writable(false);
export const updateStatus = writable<UpdateStatus>({
    available: false,
    downloaded: false,
    version: null,
    notes: "",
    releaseDate: null,
});

const LOCAL_MODE_KEY = "local_mode_enabled";
const AVE_USER_KEY = "ave_user";
const AVE_TOKEN_KEY = "ave_token_jwt";
const AVE_REFRESH_TOKEN_KEY = "ave_refresh_token";
const HOME_REFRESH_EVENT = "raffi:home-refresh";

let userCache: AppUser | null = null;
let initialized = false;
let seededUserId: string | null = null;

const readLocalMode = () => {
    if (typeof window === "undefined") return false;
    try {
        return localStorage.getItem(LOCAL_MODE_KEY) === "true";
    } catch {
        return false;
    }
};

const persistLocalMode = (enabled: boolean) => {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(LOCAL_MODE_KEY, String(enabled));
    } catch {
        // ignore
    }
};

export const enableLocalMode = () => {
    localMode.set(true);
    persistLocalMode(true);
    setConvexAuthToken(null);
    ensureDefaultAddonsForLocal().catch(() => {
        // ignore
    });
};

export const disableLocalMode = () => {
    localMode.set(false);
    persistLocalMode(false);
};

const persistAveSession = (user: AppUser | null) => {
    if (typeof window === "undefined") return;
    if (!user) {
        localStorage.removeItem(AVE_USER_KEY);
        localStorage.removeItem(AVE_TOKEN_KEY);
        localStorage.removeItem(AVE_REFRESH_TOKEN_KEY);
        return;
    }
    localStorage.setItem(AVE_USER_KEY, JSON.stringify({
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        provider: user.provider,
    }));
    localStorage.setItem(AVE_TOKEN_KEY, user.token);
    if (user.refreshToken) {
        localStorage.setItem(AVE_REFRESH_TOKEN_KEY, user.refreshToken);
    } else {
        localStorage.removeItem(AVE_REFRESH_TOKEN_KEY);
    }
};

const readAveSession = (): AppUser | null => {
    if (typeof window === "undefined") return null;
    try {
        const userRaw = localStorage.getItem(AVE_USER_KEY);
        const token = localStorage.getItem(AVE_TOKEN_KEY);
        const refreshToken = localStorage.getItem(AVE_REFRESH_TOKEN_KEY);
        if (!userRaw || !token) return null;
        const parsed = JSON.parse(userRaw);
        if (!parsed?.id) return null;
        return {
            id: String(parsed.id),
            email: parsed.email ?? null,
            name: parsed.name ?? null,
            avatar: parsed.avatar ?? null,
            provider: "ave",
            token,
            refreshToken: refreshToken ?? parsed.refreshToken ?? null,
        };
    } catch {
        return null;
    }
};

const emitHomeRefresh = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(HOME_REFRESH_EVENT));
};

async function seedDefaultsIfNeeded(user: AppUser | null) {
    const userId = user?.id;
    if (!userId) return;
    if (seededUserId === userId) return;
    seededUserId = userId;
    await ensureDefaultAddonsForUser(userId);
}

const clearAveSession = () => {
    userCache = null;
    currentUser.set(null);
    persistAveSession(null);
    setConvexAuthToken(null);
};

const isStoredAveSessionValid = async () => {
    try {
        await convexQuery("raffi:getState", {});
        return true;
    } catch {
        return false;
    }
};

const tryRefreshAveSession = async (user: AppUser): Promise<AppUser | null> => {
    if (!user?.refreshToken) return null;
    try {
        const refreshedUser = await refreshAveUserSession(user);
        setConvexAuthToken(refreshedUser.token);
        const valid = await isStoredAveSessionValid();
        if (!valid) return null;
        persistAveSession(refreshedUser);
        return refreshedUser;
    } catch {
        return null;
    }
};

const isInvalidLegacyRefreshError = (error: any) => {
    const message = String(error?.message || "").toLowerCase();
    return message.includes("invalid refresh token") || message.includes("refresh token not found");
};

export async function initAuth() {
    if (initialized) return;
    initialized = true;

    const storedLocalMode = readLocalMode();
    const hasStoredLocalMode = typeof window !== "undefined" && localStorage.getItem(LOCAL_MODE_KEY) !== null;
    localMode.set(hasStoredLocalMode ? storedLocalMode : true);
    if (!hasStoredLocalMode) {
        persistLocalMode(true);
    }

    const storedUser = readAveSession();
    userCache = storedUser;
    currentUser.set(storedUser);

    if (storedUser) {
        setConvexAuthToken(storedUser.token);
        let activeUser: AppUser | null = storedUser;
        const valid = await isStoredAveSessionValid();
        if (!valid) {
            activeUser = await tryRefreshAveSession(storedUser);
        }

        if (!activeUser) {
            clearAveSession();
            enableLocalMode();
        } else {
            userCache = activeUser;
            currentUser.set(activeUser);
            setConvexAuthToken(activeUser.token);
        }
    }

    if (userCache) {
        if (hasLocalState()) {
            await syncLocalStateToUser(userCache.id);
        }
        disableLocalMode();
        await seedDefaultsIfNeeded(userCache);
    } else {
        enableLocalMode();
        await ensureDefaultAddonsForLocal();
    }

    legacyMigrationNeeded.set(!userCache && hasLegacySupabaseSession());

}

export async function signInWithAve() {
    const user = await signInWithAveViaBrowser();
    userCache = user;
    currentUser.set(user);
    setConvexAuthToken(user.token);
    persistAveSession(user);

    disableLocalMode();

    try {
        if (hasLocalState()) {
            await syncLocalStateToUser(user.id);
        }
        await seedDefaultsIfNeeded(user);
    } catch (error) {
        console.error("Ave sign-in sync failed", error);
    }

    emitHomeRefresh();
}

export function signOutToLocalMode() {
    userCache = null;
    currentUser.set(null);
    persistAveSession(null);
    enableLocalMode();
    emitHomeRefresh();
}

export const dismissLegacyMigrationPrompt = () => {
    legacyMigrationNeeded.set(false);
};

export const migrateLegacySessionToLocal = async () => {
    try {
        const result = await importLegacySupabaseSessionToLocal();
        clearLegacySupabaseSession();
        enableLocalMode();
        legacyMigrationNeeded.set(false);
        emitHomeRefresh();
        return result;
    } catch (error) {
        if (isInvalidLegacyRefreshError(error)) {
            clearLegacySupabaseSession();
            enableLocalMode();
            legacyMigrationNeeded.set(false);
            emitHomeRefresh();
            return {
                addons: 0,
                library: 0,
                lists: 0,
                listItems: 0,
            };
        }
        throw error;
    }
};

export const migrateLegacySessionAndSignInAve = async () => {
    await migrateLegacySessionToLocal();
    await signInWithAve();
};

export function getCachedUser(): AppUser | null {
    return userCache;
}
