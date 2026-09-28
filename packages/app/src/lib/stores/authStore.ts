import type { AppUser } from "../auth/types";
import {
    AccountRequestError,
    fetchActiveSession,
    fetchSessionJwt,
    handOffAveSession,
    isRejectedSession,
    requestSignInCode,
    revokeSession,
    updateAccountName,
    verifySignInCode,
    type SignedInSession,
} from "../auth/accountApi";
import { prepareAvatarImage } from "../auth/avatarImage";
import { clearLegacyAveSession, readLegacyAveTokens } from "../auth/legacyAveSession";
import {
    clearStoredSession,
    readStoredSession,
    storeSessionToken,
    storeSessionUser,
} from "../auth/storedSession";
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
import {
    setRaffiSyncAuthFailureHandler,
    setRaffiSyncAuthRefreshHandler,
    setRaffiSyncAuthToken,
    syncDelete,
    syncPut,
} from "../db/raffiSync";
import { writable } from "svelte/store";

export type UpdateStatus = {
    available: boolean;
    downloaded: boolean;
    downloadProgress: number | null;
    version: string | null;
    notes: string;
    releaseDate: string | null;
};

export type SignInChangeNotice = "signed-in" | "sign-in-needed";

export const currentUser = writable<AppUser | null>(null);
export const localMode = writable(false);
export const authInitializing = writable(false);
export const signInChangeNotice = writable<SignInChangeNotice | null>(null);
export const updateStatus = writable<UpdateStatus>({
    available: false,
    downloaded: false,
    downloadProgress: null,
    version: null,
    notes: "",
    releaseDate: null,
});

const LOCAL_MODE_KEY = "local_mode_enabled";
const HOME_REFRESH_EVENT = "raffi:home-refresh";

let userCache: AppUser | null = null;
let sessionToken: string | null = null;
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
    setRaffiSyncAuthToken(null);
    ensureDefaultAddonsForLocal().catch(() => {
        // ignore
    });
};

export const disableLocalMode = () => {
    localMode.set(false);
    persistLocalMode(false);
};

const emitHomeRefresh = (options: { preserveHero?: boolean } = {}) => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(HOME_REFRESH_EVENT, {
        detail: {
            preserveHero: options.preserveHero ?? true,
        },
    }));
};

const setActiveUser = (user: AppUser | null) => {
    userCache = user;
    currentUser.set(user);
    if (user) storeSessionUser(user);
};

const adoptSession = (session: SignedInSession) => {
    sessionToken = session.sessionToken;
    storeSessionToken(session.sessionToken);
    setActiveUser(session.user);
};

const forgetSession = () => {
    sessionToken = null;
    userCache = null;
    currentUser.set(null);
    clearStoredSession();
    setRaffiSyncAuthToken(null);
};

async function seedDefaultsIfNeeded(user: AppUser | null) {
    const userId = user?.id;
    if (!userId) return;
    if (seededUserId === userId) return;
    seededUserId = userId;
    await ensureDefaultAddonsForUser(userId);
}

async function hydrateSignedInState(context: string) {
    try {
        const result = await hydrateLocalBackupFromCloud();
        return result.ok;
    } catch (error) {
        console.error(`${context} cloud hydrate failed`, error);
        return false;
    }
}

async function seedSignedInDefaults(user: AppUser, context: string) {
    try {
        await seedDefaultsIfNeeded(user);
        return true;
    } catch (error) {
        console.error(`${context} default addon setup failed`, error);
        return false;
    }
}

async function syncSignedInUser(user: AppUser, context: string) {
    let shouldRefreshHome = await hydrateSignedInState(context);

    const syncResult = await syncLocalStateToUser(user.id);
    shouldRefreshHome = shouldRefreshHome || syncResult.ok;
    shouldRefreshHome = await seedSignedInDefaults(user, context) || shouldRefreshHome;
    void flushPendingLibraryProgress();

    if (hasLocalState()) {
        void warmRemoteStateCache().then((merged) => {
            if (merged) emitHomeRefresh();
        });
    }

    if (shouldRefreshHome) {
        emitHomeRefresh();
    }
}

async function restoreStoredSession(): Promise<AppUser | null> {
    const stored = readStoredSession();
    if (!stored) return null;
    sessionToken = stored.sessionToken;

    try {
        const active = await fetchActiveSession(stored.sessionToken);
        setRaffiSyncAuthToken(active.jwt);
        setActiveUser(active.user);
        return active.user;
    } catch (error) {
        if (isRejectedSession(error)) {
            forgetSession();
            return null;
        }
        console.error("Session restore failed", error);
        setActiveUser(stored.user);
        return stored.user;
    }
}

async function handOffLegacyAveSession(): Promise<AppUser | null> {
    const tokens = readLegacyAveTokens();
    if (!tokens) return null;

    try {
        const session = await handOffAveSession(tokens);
        clearLegacyAveSession();
        adoptSession(session);
        signInChangeNotice.set("signed-in");
        setRaffiSyncAuthToken(await fetchSessionJwt(session.sessionToken).catch(() => null));
        return session.user;
    } catch (error) {
        if (error instanceof AccountRequestError) {
            clearLegacyAveSession();
            signInChangeNotice.set("sign-in-needed");
        } else {
            console.error("Account handoff failed", error);
        }
        return null;
    }
}

const refreshSessionJwt = async (): Promise<string | null> => {
    if (!sessionToken) return null;
    try {
        return await fetchSessionJwt(sessionToken);
    } catch (error) {
        if (isRejectedSession(error)) return null;
        throw error;
    }
};

export async function initAuth() {
    if (initialized) return;
    initialized = true;
    authInitializing.set(true);

    try {
        const hasStoredLocalMode = typeof window !== "undefined" && localStorage.getItem(LOCAL_MODE_KEY) !== null;
        localMode.set(hasStoredLocalMode ? readLocalMode() : true);
        if (!hasStoredLocalMode) {
            persistLocalMode(true);
        }

        const activeUser = await restoreStoredSession() ?? await handOffLegacyAveSession();

        if (activeUser) {
            disableLocalMode();
            resetRemoteStateCache();
            startCloudReconciliationLoop();
            void syncSignedInUser(activeUser, "Startup sync");
        } else {
            enableLocalMode();
            void ensureDefaultAddonsForLocal().then(() => emitHomeRefresh());
        }
    } finally {
        authInitializing.set(false);
    }
}

export const sendSignInCode = (email: string) => requestSignInCode(email);

export async function signInWithCode(email: string, code: string) {
    const session = await verifySignInCode(email, code);
    adoptSession(session);
    setRaffiSyncAuthToken(await fetchSessionJwt(session.sessionToken));
    signInChangeNotice.set(null);

    disableLocalMode();
    resetRemoteStateCache();
    startCloudReconciliationLoop();
    await syncSignedInUser(session.user, "Sign-in sync");
}

export async function signOutToLocalMode() {
    const revokedToken = sessionToken;
    stopCloudReconciliationLoop();
    forgetSession();
    resetRemoteStateCache();
    enableLocalMode();
    emitHomeRefresh();
    if (revokedToken) await revokeSession(revokedToken).catch(() => undefined);
}

const updateActiveUser = (changes: Partial<AppUser>) => {
    if (!userCache) return;
    setActiveUser({ ...userCache, ...changes });
};

export async function renameAccount(name: string) {
    if (!sessionToken) return;
    const trimmed = name.trim();
    await updateAccountName(sessionToken, trimmed);
    updateActiveUser({ name: trimmed || null });
}

export async function changeAccountAvatar(file: Blob) {
    const { image } = await syncPut<{ image: string }>("/profile/avatar", await prepareAvatarImage(file));
    updateActiveUser({ avatar: image });
}

export async function removeAccountAvatar() {
    await syncDelete("/profile/avatar");
    updateActiveUser({ avatar: null });
}

export function getCachedUser(): AppUser | null {
    return userCache;
}

setRaffiSyncAuthRefreshHandler(refreshSessionJwt);
setRaffiSyncAuthFailureHandler(signOutToLocalMode);
