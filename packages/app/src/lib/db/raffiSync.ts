const DEFAULT_SYNC_URL = "https://sync.raffi.al";

const configuredUrl = import.meta.env.VITE_RAFFI_SYNC_URL as string | undefined;
const RAFFI_SYNC_URL = (configuredUrl || DEFAULT_SYNC_URL).replace(/\/+$/, "");

let authToken: string | null = null;
let authRefreshHandler: (() => Promise<string | null>) | null = null;
let authFailureHandler: (() => void | Promise<void>) | null = null;
let authRefreshPromise: Promise<string | null> | null = null;
let authFailurePromise: Promise<void> | null = null;

const isAuthStatus = (status: number) => status === 401;
const TOKEN_EXPIRY_SKEW_MS = 90 * 1000;

const decodeJwtPayload = (token: string) => {
    const [, payload] = token.split(".");
    if (!payload) return null;
    try {
        const normalizedPayload = payload
            .replace(/-/g, "+")
            .replace(/_/g, "/")
            .padEnd(payload.length + (4 - (payload.length % 4 || 4)) % 4, "=");
        const decodedPayload = atob(normalizedPayload);
        return JSON.parse(decodedPayload) as { exp?: number };
    } catch {
        return null;
    }
};

const isAuthTokenExpired = (token: string | null) => {
    if (!token) return true;
    const payload = decodeJwtPayload(token);
    if (!payload?.exp) return true;
    const expiryMs = payload.exp * 1000;
    const now = Date.now();
    return now >= expiryMs - TOKEN_EXPIRY_SKEW_MS;
};

const refreshAuthToken = async () => {
    if (!authRefreshHandler) return null;
    if (!authRefreshPromise) {
        authRefreshPromise = authRefreshHandler()
            .then((refreshedToken) => {
                authToken = refreshedToken;
                return refreshedToken;
            })
            .finally(() => {
                authRefreshPromise = null;
            });
    }
    return authRefreshPromise;
};

const invalidateCloudSession = async (): Promise<never> => {
    authToken = null;
    if (authFailureHandler && !authFailurePromise) {
        authFailurePromise = Promise.resolve(authFailureHandler()).finally(() => {
            authFailurePromise = null;
        });
    }
    await authFailurePromise;
    throw new Error("Cloud session expired. Sign in again.");
};

const cloudAuthenticationUnavailable = (): never => {
    throw new Error("Cloud authentication is temporarily unavailable. Your Ave session is still signed in.");
};

const ensureValidAuthToken = async () => {
    if (!authToken || !authRefreshHandler || !isAuthTokenExpired(authToken)) {
        return false;
    }
    try {
        if (!await refreshAuthToken()) {
            return invalidateCloudSession();
        }
        return true;
    } catch {
        return cloudAuthenticationUnavailable();
    }
};

const getErrorMessage = async (response: Response) => {
    try {
        const payload = await response.json();
        if (typeof payload?.message === "string") return payload.message;
        if (typeof payload?.error === "string") return payload.error;
    } catch {
    }
    return `Raffi Sync request failed (${response.status})`;
};

const syncRequest = async <T>(
    path: string,
    init: RequestInit = {},
    options: { retryAuth?: boolean } = {},
): Promise<T> => {
    const refreshedBeforeRequest = await ensureValidAuthToken();

    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (init.body !== undefined) headers.set("Content-Type", "application/json");
    if (authToken) headers.set("Authorization", `Bearer ${authToken}`);

    const response = await fetch(`${RAFFI_SYNC_URL}${path}`, {
        ...init,
        headers,
    });

    if (isAuthStatus(response.status)) {
        if (options.retryAuth !== false && !refreshedBeforeRequest) {
            try {
                if (await refreshAuthToken()) {
                    return syncRequest<T>(path, init, { retryAuth: false });
                }
            } catch {
                return cloudAuthenticationUnavailable();
            }
            return invalidateCloudSession();
        }
        return cloudAuthenticationUnavailable();
    }

    if (!response.ok) {
        throw new Error(await getErrorMessage(response));
    }

    if (response.status === 204) return null as T;
    return response.json() as Promise<T>;
};

export const setRaffiSyncAuthToken = (token: string | null) => {
    authToken = token;
};

export const setRaffiSyncAuthRefreshHandler = (handler: (() => Promise<string | null>) | null) => {
    authRefreshHandler = handler;
};

export const setRaffiSyncAuthFailureHandler = (handler: (() => void | Promise<void>) | null) => {
    authFailureHandler = handler;
};

export const syncGet = async <T = unknown>(path: string): Promise<T> => {
    return syncRequest<T>(path, { method: "GET" });
};

export const syncPost = async <T = unknown>(path: string, body: unknown = {}): Promise<T> => {
    return syncRequest<T>(path, {
        method: "POST",
        body: JSON.stringify(body),
    });
};
