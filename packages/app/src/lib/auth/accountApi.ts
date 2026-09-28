import { RAFFI_SYNC_URL } from "../db/raffiSync";
import type { AppUser } from "./types";

type AccountUser = {
    id: string;
    email: string;
    name: string;
    image: string | null;
};

export type SignedInSession = {
    sessionToken: string;
    user: AppUser;
};

export type ActiveSession = {
    user: AppUser;
    jwt: string | null;
};

const FRIENDLY_ERRORS: Record<string, string> = {
    INVALID_OTP: "That code isn't right. Check the email and try again.",
    OTP_EXPIRED: "That code has expired. Send a new one.",
    TOO_MANY_ATTEMPTS: "Too many wrong codes. Send a new one.",
    INVALID_EMAIL: "Enter a valid email address.",
};

export class AccountRequestError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
    }
}

export const isRejectedSession = (error: unknown) =>
    error instanceof AccountRequestError && error.status === 401;

const toAppUser = (user: AccountUser): AppUser => ({
    id: user.id,
    email: user.email,
    name: user.name || null,
    avatar: user.image,
});

const readError = async (response: Response) => {
    if (response.status === 429) return "Too many attempts. Wait a minute and try again.";
    try {
        const payload = await response.json();
        if (typeof payload?.code === "string" && FRIENDLY_ERRORS[payload.code]) return FRIENDLY_ERRORS[payload.code];
        if (typeof payload?.message === "string") return payload.message;
    } catch {
    }
    return `Account request failed (${response.status})`;
};

const accountRequest = async (path: string, init: RequestInit & { sessionToken?: string; json?: unknown } = {}) => {
    const { sessionToken, json, ...requestInit } = init;
    const headers = new Headers(requestInit.headers);
    headers.set("Accept", "application/json");
    if (sessionToken) headers.set("Authorization", `Bearer ${sessionToken}`);
    if (json !== undefined) headers.set("Content-Type", "application/json");

    const response = await fetch(`${RAFFI_SYNC_URL}/auth${path}`, {
        ...requestInit,
        headers,
        body: json !== undefined ? JSON.stringify(json) : requestInit.body,
    });
    if (!response.ok) throw new AccountRequestError(await readError(response), response.status);
    return response;
};

export const requestSignInCode = async (email: string) => {
    await accountRequest("/email-otp/send-verification-otp", {
        method: "POST",
        json: { email: email.trim(), type: "sign-in" },
    });
};

export const verifySignInCode = async (email: string, code: string): Promise<SignedInSession> => {
    const response = await accountRequest("/sign-in/email-otp", {
        method: "POST",
        json: { email: email.trim(), otp: code },
    });
    const payload = await response.json() as { token: string; user: AccountUser };
    return { sessionToken: payload.token, user: toAppUser(payload.user) };
};

export const handOffAveSession = async (tokens: { idToken?: string; refreshToken?: string }): Promise<SignedInSession> => {
    const response = await accountRequest("/ave/handoff", {
        method: "POST",
        json: tokens,
    });
    const payload = await response.json() as { token: string; user: AccountUser };
    return { sessionToken: payload.token, user: toAppUser(payload.user) };
};

export const fetchActiveSession = async (sessionToken: string): Promise<ActiveSession> => {
    const response = await accountRequest("/get-session", { sessionToken });
    const payload = await response.json() as { user: AccountUser } | null;
    if (!payload) throw new AccountRequestError("Session expired", 401);
    return {
        user: toAppUser(payload.user),
        jwt: response.headers.get("set-auth-jwt"),
    };
};

export const fetchSessionJwt = async (sessionToken: string) => {
    const response = await accountRequest("/token", { sessionToken });
    const payload = await response.json() as { token: string };
    return payload.token;
};

export const updateAccountName = async (sessionToken: string, name: string) => {
    await accountRequest("/update-user", {
        method: "POST",
        sessionToken,
        json: { name },
    });
};

export const revokeSession = async (sessionToken: string) => {
    await accountRequest("/sign-out", {
        method: "POST",
        sessionToken,
        json: {},
    });
};
