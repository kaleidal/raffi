import {
    exchangeCode,
    fetchUserInfo,
    generateCodeChallenge,
    generateCodeVerifier,
    generateNonce,
    refreshToken,
} from "@ave-id/sdk";
import type { AppUser } from "./types";

const AVE_CLIENT_ID = "app_13afc5b8884e9985d89eac0f4ca4b5af";
const AVE_ISSUER = "https://api.aveid.net";
const AVE_SIGNIN_URL = "https://aveid.net/signin";
const AVE_REDIRECT_URI = "raffi://auth/callback";

const PKCE_VERIFIER_KEY = "ave_pkce_verifier";
const PKCE_STATE_KEY = "ave_pkce_state";

const AVE_OAUTH_CONFIG = {
    clientId: AVE_CLIENT_ID,
    redirectUri: AVE_REDIRECT_URI,
    issuer: AVE_ISSUER,
};

const decodeJwtPayload = (token: string): Record<string, any> | null => {
    try {
        const parts = token.split(".");
        if (parts.length < 2) return null;
        const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
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

const getElectronApi = () => (window as any).electronAPI as {
    openExternal?: (url: string) => Promise<void>;
    onAveAuthCallback?: (callback: (payload: { code?: string; state?: string; error?: string }) => void) => () => void;
};

const buildUserFromTokens = async (tokens: any, fallback?: AppUser): Promise<AppUser> => {
    const jwtToken = tokens?.id_token || tokens?.access_token_jwt || tokens?.access_token;
    if (!jwtToken) {
        throw new Error("Ave token exchange did not return a JWT token");
    }

    let profile: any = null;
    const accessToken = tokens?.access_token;
    if (accessToken) {
        try {
            profile = await fetchUserInfo(AVE_OAUTH_CONFIG, accessToken);
        } catch {
            profile = null;
        }
    }

    const claims = decodeJwtPayload(jwtToken) || {};
    const id = String(profile?.sub || claims.sub || fallback?.id || "");
    if (!id) {
        throw new Error("Unable to resolve Ave user id");
    }

    return {
        id,
        email: profile?.email || claims.email || fallback?.email || null,
        name:
            profile?.name ||
            profile?.preferred_username ||
            claims.name ||
            claims.preferred_username ||
            fallback?.name ||
            null,
        avatar: profile?.picture || claims.picture || fallback?.avatar || null,
        provider: "ave",
        token: jwtToken,
        refreshToken: tokens?.refresh_token || fallback?.refreshToken || null,
    };
};

export async function signInWithAveViaBrowser(): Promise<AppUser> {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateNonce();
    const nonce = generateNonce();

    sessionStorage.setItem(PKCE_VERIFIER_KEY, codeVerifier);
    sessionStorage.setItem(PKCE_STATE_KEY, state);

    const authParams = new URLSearchParams({
        client_id: AVE_CLIENT_ID,
        redirect_uri: AVE_REDIRECT_URI,
        scope: "openid profile email offline_access",
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
    });
    const url = `${AVE_SIGNIN_URL}?${authParams.toString()}`;

    const electronAPI = getElectronApi();
    if (!electronAPI?.openExternal || !electronAPI?.onAveAuthCallback) {
        throw new Error("Ave auth requires Electron desktop runtime");
    }

    const callbackPayload = await new Promise<{ code?: string; state?: string; error?: string }>((resolve, reject) => {
        const timeout = setTimeout(() => {
            unsubscribe?.();
            reject(new Error("Ave sign-in timed out"));
        }, 5 * 60 * 1000);

        const unsubscribe = electronAPI.onAveAuthCallback?.((payload) => {
            clearTimeout(timeout);
            unsubscribe?.();
            resolve(payload || {});
        });

        electronAPI
            .openExternal?.(url)
            .catch((error) => {
                clearTimeout(timeout);
                unsubscribe?.();
                reject(error);
            });
    });

    if (callbackPayload.error) {
        throw new Error(callbackPayload.error);
    }

    const receivedState = callbackPayload.state;
    const receivedCode = callbackPayload.code;
    const storedState = sessionStorage.getItem(PKCE_STATE_KEY);
    const storedVerifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);

    if (!receivedCode || !receivedState || !storedState || !storedVerifier) {
        throw new Error("Invalid Ave callback payload");
    }
    if (receivedState !== storedState) {
        throw new Error("Invalid Ave state");
    }

    const tokens = await exchangeCode(AVE_OAUTH_CONFIG, {
        code: receivedCode,
        codeVerifier: storedVerifier,
    });

    const user = await buildUserFromTokens(tokens);

    sessionStorage.removeItem(PKCE_VERIFIER_KEY);
    sessionStorage.removeItem(PKCE_STATE_KEY);

    return user;
}

export async function refreshAveUserSession(user: AppUser): Promise<AppUser> {
    if (!user?.refreshToken) {
        throw new Error("No Ave refresh token available");
    }
    const tokens = await refreshToken(AVE_OAUTH_CONFIG, {
        refreshToken: user.refreshToken,
    });
    return buildUserFromTokens(tokens, user);
}
