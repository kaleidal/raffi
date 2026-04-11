import {
    exchangeCode,
    fetchUserInfo,
    generateCodeChallenge,
    generateCodeVerifier,
    generateNonce,
    refreshToken,
    verifyJwt,
} from "@ave-id/sdk";
import type { AppUser } from "./types";

const AVE_CLIENT_ID = "app_13afc5b8884e9985d89eac0f4ca4b5af";
const AVE_ISSUER = "https://aveid.net";
const AVE_SIGNIN_URL = "https://aveid.net/signin";
const AVE_REDIRECT_URI = "raffi://auth/callback";

const PKCE_VERIFIER_KEY = "ave_pkce_verifier";
const PKCE_STATE_KEY = "ave_pkce_state";
const PKCE_NONCE_KEY = "ave_pkce_nonce";

const AVE_OAUTH_CONFIG = {
    clientId: AVE_CLIENT_ID,
    redirectUri: AVE_REDIRECT_URI,
    issuer: AVE_ISSUER,
};

const getElectronApi = () => (window as any).electronAPI as {
    openExternal?: (url: string) => Promise<void>;
    onAveAuthCallback?: (callback: (payload: { code?: string; state?: string; error?: string }) => void) => () => void;
};

const buildUserFromTokens = async (
    tokens: any,
    options: {
        fallback?: AppUser;
        expectedNonce?: string | null;
        requireFreshRefreshToken?: boolean;
    } = {},
): Promise<AppUser> => {
    const { fallback, expectedNonce = null, requireFreshRefreshToken = false } = options;
    const idToken = tokens?.id_token;
    if (!idToken || typeof idToken !== "string") {
        throw new Error("Sign-in response did not include an id_token");
    }

    const claims = await verifyJwt<Record<string, any>>(idToken, {
        expectedIssuer: AVE_ISSUER,
        audience: AVE_CLIENT_ID,
        nonce: expectedNonce || undefined,
    });

    if (!claims) {
        throw new Error("Sign-in response could not be validated");
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

    const id = String(profile?.sub || claims.sub || fallback?.id || "");
    if (!id) {
        throw new Error("Unable to resolve user id");
    }

    const resolvedRefreshToken =
        tokens?.refresh_token ||
        tokens?.refreshToken ||
        tokens?.refresh?.token ||
        fallback?.refreshToken ||
        null;

    if (requireFreshRefreshToken && !resolvedRefreshToken) {
        throw new Error("Sign-in response did not include a refresh token");
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
        token: idToken,
        refreshToken: resolvedRefreshToken,
    };
};

export async function signInWithAveViaBrowser(): Promise<AppUser> {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateNonce();
    const nonce = generateNonce();

    sessionStorage.setItem(PKCE_VERIFIER_KEY, codeVerifier);
    sessionStorage.setItem(PKCE_STATE_KEY, state);
    sessionStorage.setItem(PKCE_NONCE_KEY, nonce);

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
        throw new Error("Sign-in requires the desktop app");
    }

    const callbackPayload = await new Promise<{ code?: string; state?: string; error?: string }>((resolve, reject) => {
        const timeout = setTimeout(() => {
            unsubscribe?.();
            reject(new Error("Sign-in timed out"));
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
    const storedNonce = sessionStorage.getItem(PKCE_NONCE_KEY);

    try {
        if (!receivedCode || !receivedState || !storedState || !storedVerifier || !storedNonce) {
            throw new Error("Invalid sign-in callback");
        }
        if (receivedState !== storedState) {
            throw new Error("Invalid sign-in state");
        }

        const tokens = await exchangeCode(AVE_OAUTH_CONFIG, {
            code: receivedCode,
            codeVerifier: storedVerifier,
        });

        return await buildUserFromTokens(tokens, {
            expectedNonce: storedNonce,
            requireFreshRefreshToken: true,
        });
    } finally {
        sessionStorage.removeItem(PKCE_VERIFIER_KEY);
        sessionStorage.removeItem(PKCE_STATE_KEY);
        sessionStorage.removeItem(PKCE_NONCE_KEY);
    }
}

export async function refreshAveUserSession(user: AppUser): Promise<AppUser> {
    if (!user?.refreshToken) {
        throw new Error("No refresh token available");
    }
    const tokens = await refreshToken(AVE_OAUTH_CONFIG, {
        refreshToken: user.refreshToken,
    });
    return buildUserFromTokens(tokens, {
        fallback: user,
        requireFreshRefreshToken: true,
    });
}
