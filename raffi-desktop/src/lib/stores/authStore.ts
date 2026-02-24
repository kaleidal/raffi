import type { AppUser } from "../auth/types";
import { refreshAveUserSession, signInWithAveViaBrowser } from "../auth/aveAuth";
import {
    ensureDefaultAddonsForUser,
    ensureDefaultAddonsForLocal,
    resetRemoteStateCache,
    syncLocalStateToUser,
    warmRemoteStateCache,
    hasLocalState,
} from "../db/db";
import {
    hasLegacySupabaseSession,
    clearLegacySupabaseSession,
} from "../db/supabaseLegacy";
import { setConvexAuthRefreshHandler, setConvexAuthToken } from "../db/convex";
import { writable } from "svelte/store";

export type UpdateStatus = {
    available: boolean;
    downloaded: boolean;
    downloadProgress: number | null;
    version: string | null;
    notes: string;
    releaseDate: string | null;
};

export const currentUser = writable<AppUser | null>(null);
export const localMode = writable(false);
export const updateStatus = writable<UpdateStatus>({
    available: false,
    downloaded: false,
    downloadProgress: null,
    version: null,
    notes: "",
    releaseDate: null,
});

const LOCAL_MODE_KEY = "local_mode_enabled";
const AVE_USER_KEY = "ave_user";
const AVE_TOKEN_KEY = "ave_token_jwt";
const AVE_REFRESH_TOKEN_KEY = "ave_refresh_token";
const HOME_REFRESH_EVENT = "raffi:home-refresh";
const TOKEN_REFRESH_LEEWAY_MS = 5 * 60 * 1000;
const TOKEN_REFRESH_RETRY_MS = 60 * 1000;
const TOKEN_REFRESH_FALLBACK_MS = 45 * 60 * 1000;

let userCache: AppUser | null = null;
let initialized = false;
let seededUserId: string | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

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
    clearSessionRefreshTimer();
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

const clearSessionRefreshTimer = () => {
    if (!refreshTimer) return;
    clearTimeout(refreshTimer);
    refreshTimer = null;
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

const decodeJwtPayload = (token: string): Record<string, any> | null => {
    try {
        const parts = token.split(".");
        if (parts.length < 2) return null;
        const payloadBase64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const padLength = (4 - (payloadBase64.length % 4)) % 4;
        const base64 = payloadBase64.padEnd(payloadBase64.length + padLength, "=");
        const json = decodeURIComponent(
            atob(base64)
                .split("")
                .map((ch) => `%${(`00${ch.charCodeAt(0).toString(16)}`).slice(-2)}`)
                .join(""),
        );
        return JSON.parse(json);
    } catch {
        return null;
    }
};

const getTokenExpiryMs = (token: string | null | undefined): number | null => {
    if (!token) return null;
    const payload = decodeJwtPayload(token);
    const exp = Number(payload?.exp);
    if (!Number.isFinite(exp) || exp <= 0) return null;
    return exp * 1000;
};

const shouldRefreshToken = (token: string, leewayMs = TOKEN_REFRESH_LEEWAY_MS) => {
    const expiresAt = getTokenExpiryMs(token);
    if (!expiresAt) return false;
    return expiresAt - Date.now() <= leewayMs;
};

const isPermanentAveRefreshError = (error: any) => {
    const message = String(error?.message || "").toLowerCase();
    return (
        message.includes("invalid refresh token") ||
        message.includes("refresh token not found") ||
        message.includes("invalid_grant") ||
        message.includes("unauthorized") ||
        message.includes("forbidden")
    );
};

async function seedDefaultsIfNeeded(user: AppUser | null) {
    const userId = user?.id;
    if (!userId) return;
    if (seededUserId === userId) return;
    seededUserId = userId;
    await ensureDefaultAddonsForUser(userId);
}

const clearAveSession = () => {
    clearSessionRefreshTimer();
    userCache = null;
    currentUser.set(null);
    persistAveSession(null);
    setConvexAuthToken(null);
};

const tryRefreshAveSession = async (user: AppUser): Promise<AppUser | null> => {
    if (!user?.refreshToken) return null;
    try {
        const refreshedUser = await refreshAveUserSession(user);
        setConvexAuthToken(refreshedUser.token);
        persistAveSession(refreshedUser);
        return refreshedUser;
    } catch (error) {
        if (isPermanentAveRefreshError(error)) {
            return null;
        }
        // Transient refresh failures should not immediately sign users out.
        return user;
    }
};

const applyRefreshedUser = (refreshed: AppUser) => {
    userCache = refreshed;
    currentUser.set(refreshed);
    setConvexAuthToken(refreshed.token);
    scheduleSessionRefresh(refreshed);
};

const refreshSessionFromConvexAuthFailure = async (): Promise<string | null> => {
    const activeUser = userCache;
    if (!activeUser) return null;

    const refreshed = await tryRefreshAveSession(activeUser);
    if (!refreshed) {
        clearAveSession();
        enableLocalMode();
        emitHomeRefresh();
        return null;
    }

    applyRefreshedUser(refreshed);
    return refreshed.token;
};

const scheduleSessionRefresh = (user: AppUser | null) => {
    clearSessionRefreshTimer();
    if (!user?.refreshToken) return;

    const expiresAt = getTokenExpiryMs(user.token);
    const targetDelay = expiresAt
        ? expiresAt - Date.now() - TOKEN_REFRESH_LEEWAY_MS
        : TOKEN_REFRESH_FALLBACK_MS;
    const delay = Math.max(TOKEN_REFRESH_RETRY_MS, targetDelay);

    refreshTimer = setTimeout(async () => {
        const activeUser = userCache;
        if (!activeUser || activeUser.id !== user.id) return;
        const refreshed = await tryRefreshAveSession(activeUser);
        if (!refreshed) {
            clearAveSession();
            enableLocalMode();
            emitHomeRefresh();
            return;
        }
        applyRefreshedUser(refreshed);
    }, delay);
};

const resolveStartupSession = async (storedUser: AppUser): Promise<AppUser | null> => {
    if (!shouldRefreshToken(storedUser.token)) {
        return storedUser;
    }
    if (!storedUser.refreshToken) {
        return null;
    }
    return tryRefreshAveSession(storedUser);
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
        const activeUser = await resolveStartupSession(storedUser);

        if (!activeUser) {
            clearAveSession();
            enableLocalMode();
        } else {
            userCache = activeUser;
            currentUser.set(activeUser);
            setConvexAuthToken(activeUser.token);
            scheduleSessionRefresh(activeUser);
        }
    }

    const hadLegacySupabaseSession = hasLegacySupabaseSession();
    if (hadLegacySupabaseSession) {
        clearLegacySupabaseSession();
        if (userCache) {
            clearAveSession();
        }
        enableLocalMode();
    }

    if (userCache) {
        if (hasLocalState()) {
            await syncLocalStateToUser(userCache.id);
        }
        disableLocalMode();
        resetRemoteStateCache();
        await seedDefaultsIfNeeded(userCache);
        await warmRemoteStateCache();
    } else {
        enableLocalMode();
        await ensureDefaultAddonsForLocal();
    }
}

export async function signInWithAve() {
    const user = await signInWithAveViaBrowser();
    userCache = user;
    currentUser.set(user);
    setConvexAuthToken(user.token);
    persistAveSession(user);
    scheduleSessionRefresh(user);

    disableLocalMode();
    resetRemoteStateCache();

    try {
        if (hasLocalState()) {
            await syncLocalStateToUser(user.id);
        }
        await seedDefaultsIfNeeded(user);
    } catch (error) {
        console.error("Ave sign-in sync failed", error);
    }

    await warmRemoteStateCache();

    emitHomeRefresh();
}

export function signOutToLocalMode() {
    clearSessionRefreshTimer();
    userCache = null;
    currentUser.set(null);
    persistAveSession(null);
    resetRemoteStateCache();
    enableLocalMode();
    emitHomeRefresh();
}

export function getCachedUser(): AppUser | null {
    return userCache;
}

setConvexAuthRefreshHandler(refreshSessionFromConvexAuthFailure);
