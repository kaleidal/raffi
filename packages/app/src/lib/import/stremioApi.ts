import type { StremioLibraryEntry } from "./stremioImport";

const DEFAULT_ENDPOINT = "https://api.strem.io";

export interface StremioLoginResult {
    authKey: string;
    user: {
        _id?: string;
        email?: string;
        [key: string]: unknown;
    };
}

export interface StremioApiError {
    code?: number;
    message?: string;
    wrongPass?: boolean;
    [key: string]: unknown;
}

export class StremioApiClientError extends Error {
    readonly apiError: StremioApiError | null;

    constructor(message: string, apiError: StremioApiError | null = null) {
        super(message);
        this.name = "StremioApiClientError";
        this.apiError = apiError;
    }
}

const parseApiError = (body: unknown): StremioApiError | null => {
    if (!body || typeof body !== "object") return null;
    const record = body as Record<string, unknown>;
    if (record.error && typeof record.error === "object") {
        return record.error as StremioApiError;
    }
    return null;
};

const request = async <T>(
    endpoint: string,
    method: string,
    params: Record<string, unknown> = {},
    authKey?: string | null,
): Promise<T> => {
    const response = await fetch(`${endpoint}/api/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            ...(authKey ? { authKey } : {}),
            ...params,
        }),
    });

    if (!response.ok) {
        throw new StremioApiClientError(`Stremio request failed (${response.status})`);
    }

    const body = await response.json() as { error?: StremioApiError; result?: T };
    if (body.error) {
        const message = typeof body.error.message === "string" && body.error.message.trim()
            ? body.error.message
            : "Stremio request failed";
        throw new StremioApiClientError(message, body.error);
    }

    if (body.result === undefined) {
        throw new StremioApiClientError("Stremio response had no result");
    }

    return body.result;
};

export const loginWithEmail = async (
    email: string,
    password: string,
    endpoint = DEFAULT_ENDPOINT,
): Promise<StremioLoginResult> => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
        throw new StremioApiClientError("Email is required");
    }
    if (!password) {
        throw new StremioApiClientError("Password is required");
    }

    const result = await request<StremioLoginResult>(endpoint, "login", {
        email: trimmedEmail,
        password,
    });

    if (!result?.authKey) {
        throw new StremioApiClientError("Stremio login did not return a session");
    }

    return result;
};

export const logoutStremio = async (
    authKey: string,
    endpoint = DEFAULT_ENDPOINT,
): Promise<void> => {
    if (!authKey) return;
    try {
        await request(endpoint, "logout", {}, authKey);
    } catch {
        // Best-effort remote logout; local session is cleared either way.
    }
};

const normalizeLibraryResponse = (result: unknown): StremioLibraryEntry[] => {
    if (Array.isArray(result)) {
        return result as StremioLibraryEntry[];
    }
    if (result && typeof result === "object") {
        const record = result as Record<string, unknown>;
        if (Array.isArray(record.items)) {
            return record.items as StremioLibraryEntry[];
        }
        if (Array.isArray(record.library)) {
            return record.library as StremioLibraryEntry[];
        }
    }
    return [];
};

export const fetchStremioLibrary = async (
    authKey: string,
    endpoint = DEFAULT_ENDPOINT,
): Promise<StremioLibraryEntry[]> => {
    const result = await request<unknown>(endpoint, "datastoreGet", {
        collection: "libraryItem",
        ids: [],
        all: true,
    }, authKey);

    return normalizeLibraryResponse(result);
};

export const fetchStremioLibraryWithLogin = async (
    email: string,
    password: string,
    endpoint = DEFAULT_ENDPOINT,
): Promise<{ authKey: string; email: string; library: StremioLibraryEntry[] }> => {
    const login = await loginWithEmail(email, password, endpoint);
    const library = await fetchStremioLibrary(login.authKey, endpoint);
    return {
        authKey: login.authKey,
        email: typeof login.user?.email === "string" ? login.user.email : email.trim(),
        library,
    };
};
