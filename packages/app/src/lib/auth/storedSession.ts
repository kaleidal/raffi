import type { AppUser } from "./types";

const SESSION_TOKEN_KEY = "raffi_session_token";
const SESSION_USER_KEY = "raffi_session_user";

export type StoredSession = {
    sessionToken: string;
    user: AppUser | null;
};

const readUser = (): AppUser | null => {
    try {
        const parsed = JSON.parse(localStorage.getItem(SESSION_USER_KEY) || "null");
        return parsed?.id ? parsed as AppUser : null;
    } catch {
        return null;
    }
};

export const readStoredSession = (): StoredSession | null => {
    if (typeof window === "undefined") return null;
    const sessionToken = localStorage.getItem(SESSION_TOKEN_KEY);
    return sessionToken ? { sessionToken, user: readUser() } : null;
};

export const storeSessionToken = (sessionToken: string) => {
    localStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
};

export const storeSessionUser = (user: AppUser) => {
    localStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
};

export const clearStoredSession = () => {
    if (typeof window === "undefined") return;
    localStorage.removeItem(SESSION_TOKEN_KEY);
    localStorage.removeItem(SESSION_USER_KEY);
};
