import { exchangeTraktCode, getTraktStatus, type TraktStatus } from "../db/db";

const TRAKT_STATE_KEY = "trakt_oauth_state";

type TraktCallbackPayload = {
    code?: string;
    state?: string;
    error?: string;
};

const getElectronApi = () =>
    (window as any).electronAPI as {
        openExternal?: (url: string) => Promise<void>;
        onTraktAuthCallback?: (callback: (payload: TraktCallbackPayload) => void) => () => void;
    };

const generateState = () => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export async function signInWithTraktViaBrowser(): Promise<TraktStatus> {
    const status = await getTraktStatus();
    if (!status.configured || !status.clientId) {
        throw new Error("Trakt is not configured yet");
    }

    const state = generateState();
    sessionStorage.setItem(TRAKT_STATE_KEY, state);

    const authParams = new URLSearchParams({
        response_type: "code",
        client_id: status.clientId,
        redirect_uri: status.redirectUri,
        state,
    });
    const authUrl = `${status.authorizeUrl}?${authParams.toString()}`;

    const electronAPI = getElectronApi();
    if (!electronAPI?.openExternal || !electronAPI?.onTraktAuthCallback) {
        throw new Error("Trakt auth requires Electron desktop runtime");
    }

    const callbackPayload = await new Promise<TraktCallbackPayload>((resolve, reject) => {
        const timeout = setTimeout(() => {
            unsubscribe?.();
            reject(new Error("Trakt sign-in timed out"));
        }, 5 * 60 * 1000);

        const unsubscribe = electronAPI.onTraktAuthCallback?.((payload) => {
            clearTimeout(timeout);
            unsubscribe?.();
            resolve(payload || {});
        });

        electronAPI
            .openExternal?.(authUrl)
            .catch((error) => {
                clearTimeout(timeout);
                unsubscribe?.();
                reject(error);
            });
    });

    if (callbackPayload.error) {
        throw new Error(callbackPayload.error);
    }

    const storedState = sessionStorage.getItem(TRAKT_STATE_KEY);
    const receivedState = callbackPayload.state;
    const receivedCode = callbackPayload.code;
    sessionStorage.removeItem(TRAKT_STATE_KEY);

    if (!receivedCode || !receivedState || !storedState) {
        throw new Error("Invalid Trakt callback payload");
    }
    if (receivedState !== storedState) {
        throw new Error("Invalid Trakt state");
    }

    await exchangeTraktCode(receivedCode);
    return getTraktStatus();
}
