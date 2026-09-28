const AVE_SESSION_KEY = "raffi_ave_session";
const AVE_USER_KEY = "ave_user";
const AVE_TOKEN_KEY = "ave_token_jwt";
const AVE_REFRESH_TOKEN_KEY = "ave_refresh_token";

export type LegacyAveTokens = {
    idToken?: string;
    refreshToken?: string;
};

const readSnapshot = (): { id_token?: unknown; refresh_token?: unknown } | null => {
    try {
        return JSON.parse(localStorage.getItem(AVE_SESSION_KEY) || "null");
    } catch {
        return null;
    }
};

const asToken = (value: unknown) => (typeof value === "string" && value ? value : undefined);

export const readLegacyAveTokens = (): LegacyAveTokens | null => {
    if (typeof window === "undefined") return null;
    const snapshot = readSnapshot();
    const tokens = {
        idToken: asToken(snapshot?.id_token) ?? asToken(localStorage.getItem(AVE_TOKEN_KEY)),
        refreshToken: asToken(snapshot?.refresh_token) ?? asToken(localStorage.getItem(AVE_REFRESH_TOKEN_KEY)),
    };
    return tokens.idToken || tokens.refreshToken ? tokens : null;
};

export const clearLegacyAveSession = () => {
    if (typeof window === "undefined") return;
    for (const key of [AVE_SESSION_KEY, AVE_USER_KEY, AVE_TOKEN_KEY, AVE_REFRESH_TOKEN_KEY]) {
        localStorage.removeItem(key);
    }
};
