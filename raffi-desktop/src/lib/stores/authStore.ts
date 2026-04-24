import type { AppUser } from "../auth/types";
import {
    adoptLegacyAveSession,
    clearAveSessionStorage,
    refreshAveUserSession,
    restoreAveUserFromSession,
    signInWithAveViaBrowser,
} from "../auth/aveAuth";
import {
    ensureDefaultAddonsForUser,
    ensureDefaultAddonsForLocal,
    flushPendingLibraryProgress,
    hasLocalState,
    hydrateLocalBackupFromCloud,
    resetRemoteStateCache,
    startCloudReconciliationLoop,
    stopCloudReconciliationLoop,
    syncLocalStateToUser,
    warmRemoteStateCache,
} from "../db/db";
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
    stopCloudReconciliationLoop();
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
    localStorage.removeItem(AVE_TOKEN_KEY);
    localStorage.removeItem(AVE_REFRESH_TOKEN_KEY);
};

const readLegacyAveSession = (): AppUser | null => {
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

const isPermanentAveRefreshError = (error: any) => {
    const message = String(error?.message || "").toLowerCase();
    return (
        message.includes("invalid refresh token") ||
        message.includes("refresh token not found") ||
        message.includes("invalid_grant") ||
        message.includes("refresh token expired") ||
        message.includes("refresh token revoked") ||
        message.includes("token has been revoked")
    );
};

async function seedDefaultsIfNeeded(user: AppUser | null) {
    const userId = user?.id;
    if (!userId) return;
    if (seededUserId === userId) return;
    seededUserId = userId;
    await ensureDefaultAddonsForUser(userId);
}

const resolveStoredAveUser = async (legacyUser: AppUser | null): Promise<AppUser | null> => {
    try {
        const sessionUser = await restoreAveUserFromSession(legacyUser);
        if (sessionUser) return sessionUser;
        if (!legacyUser) return null;
        return await adoptLegacyAveSession(legacyUser);
    } catch (error) {
        if (!isPermanentAveRefreshError(error) && !String((error as any)?.message || "").includes("No Ave session")) {
            console.error("Ave session restore failed", error);
        }
        return null;
    }
};

const clearAveSession = () => {
    userCache = null;
    currentUser.set(null);
    persistAveSession(null);
    void clearAveSessionStorage();
    setConvexAuthToken(null);
};

const tryRefreshAveSession = async (user: AppUser): Promise<AppUser | null> => {
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

export async function initAuth() {
    if (initialized) return;
    initialized = true;

    const storedLocalMode = readLocalMode();
    const hasStoredLocalMode = typeof window !== "undefined" && localStorage.getItem(LOCAL_MODE_KEY) !== null;
    localMode.set(hasStoredLocalMode ? storedLocalMode : true);
    if (!hasStoredLocalMode) {
        persistLocalMode(true);
    }

    const legacyUser = readLegacyAveSession();
    const activeUser = await resolveStoredAveUser(legacyUser);

    if (activeUser) {
        userCache = activeUser;
        currentUser.set(activeUser);
        setConvexAuthToken(activeUser.token);
        persistAveSession(activeUser);
    } else if (legacyUser) {
        clearAveSession();
        enableLocalMode();
    }

    if (userCache) {
        disableLocalMode();
        resetRemoteStateCache();
        startCloudReconciliationLoop();
        await seedDefaultsIfNeeded(userCache);
        if (!hasLocalState()) {
            await hydrateLocalBackupFromCloud();
        }
        void syncLocalStateToUser(userCache.id);
        void flushPendingLibraryProgress();
        if (hasLocalState()) {
            void warmRemoteStateCache();
        }
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

    disableLocalMode();
    resetRemoteStateCache();
    startCloudReconciliationLoop();

    try {
        await seedDefaultsIfNeeded(user);
        if (!hasLocalState()) {
            await hydrateLocalBackupFromCloud();
        }
    } catch (error) {
        console.error("Sign-in sync failed", error);
    }

    void syncLocalStateToUser(user.id);
    void flushPendingLibraryProgress();
    if (hasLocalState()) {
        void warmRemoteStateCache();
    }

    emitHomeRefresh();
}

export function signOutToLocalMode() {
    stopCloudReconciliationLoop();
    userCache = null;
    currentUser.set(null);
    persistAveSession(null);
    void clearAveSessionStorage();
    resetRemoteStateCache();
    enableLocalMode();
    emitHomeRefresh();
}

export function getCachedUser(): AppUser | null {
    return userCache;
}

setConvexAuthRefreshHandler(refreshSessionFromConvexAuthFailure);
