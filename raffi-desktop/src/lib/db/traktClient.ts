import type { TraktRecommendation, TraktScrobbleArgs } from "./types";
import { convexAction } from "./convex";
import { canUseCloudFeatures, getRequiredUserId, isLocalModeActive } from "./state";

const TRAKT_API_BASE_URL = "https://api.trakt.tv";
const TOKEN_EXPIRY_SKEW_MS = 30_000;

type TraktClientAuthResponse = {
    ok: boolean;
    configured?: boolean;
    connected?: boolean;
    reason?: string;
    message?: string;
    clientId?: string | null;
    accessToken?: string | null;
    expiresAt?: number | null;
};

type CachedAuth = {
    clientId: string;
    accessToken: string;
    expiresAt: number | null;
};

let cachedAuth: CachedAuth | null = null;
let authRequestInFlight: Promise<CachedAuth | null> | null = null;
let lastNoAuthReason: string = "not_connected";

const parseJsonSafe = async (response: Response) => {
    try {
        return await response.json();
    } catch {
        return null;
    }
};

const getTraktErrorMessage = (status: number, payload: any) => {
    const maybeMessage =
        (typeof payload?.error_description === "string" && payload.error_description) ||
        (typeof payload?.error === "string" && payload.error) ||
        (typeof payload?.message === "string" && payload.message) ||
        null;
    return maybeMessage || `Trakt request failed (${status})`;
};

const isAuthFresh = (auth: CachedAuth | null) => {
    if (!auth) return false;
    if (!Number.isFinite(Number(auth.expiresAt)) || Number(auth.expiresAt) <= 0) return true;
    return Number(auth.expiresAt) > Date.now() + TOKEN_EXPIRY_SKEW_MS;
};

const requestClientAuth = async (forceRefresh = false): Promise<CachedAuth | null> => {
    if (isLocalModeActive()) {
        lastNoAuthReason = "local_mode";
        cachedAuth = null;
        return null;
    }

    if (!canUseCloudFeatures()) {
        lastNoAuthReason = "cloud_unavailable";
        cachedAuth = null;
        return null;
    }

    getRequiredUserId();

    const result = await convexAction<TraktClientAuthResponse>("raffi:getTraktClientAuth", {
        forceRefresh,
    });

    if (
        result?.ok &&
        typeof result.clientId === "string" &&
        result.clientId &&
        typeof result.accessToken === "string" &&
        result.accessToken
    ) {
        cachedAuth = {
            clientId: result.clientId,
            accessToken: result.accessToken,
            expiresAt: Number.isFinite(Number(result.expiresAt))
                ? Number(result.expiresAt)
                : null,
        };
        lastNoAuthReason = "";
        return cachedAuth;
    }

    cachedAuth = null;
    lastNoAuthReason = String(result?.reason || "not_connected");
    return null;
};

const ensureClientAuth = async (forceRefresh = false): Promise<CachedAuth | null> => {
    if (!forceRefresh && isAuthFresh(cachedAuth)) {
        return cachedAuth;
    }

    if (!authRequestInFlight) {
        authRequestInFlight = requestClientAuth(forceRefresh).finally(() => {
            authRequestInFlight = null;
        });
    }

    return authRequestInFlight;
};

const traktRequest = async (
    path: string,
    init: RequestInit,
): Promise<{ response: Response; body: any } | null> => {
    const auth = await ensureClientAuth(false);
    if (!auth) return null;

    const makeRequest = async (currentAuth: CachedAuth) => {
        const response = await fetch(`${TRAKT_API_BASE_URL}${path}`, {
            ...init,
            headers: {
                "Content-Type": "application/json",
                "trakt-api-version": "2",
                "trakt-api-key": currentAuth.clientId,
                Authorization: `Bearer ${currentAuth.accessToken}`,
                ...(init.headers || {}),
            },
        });
        const body = await parseJsonSafe(response);
        return { response, body };
    };

    let result = await makeRequest(auth);
    if (result.response.status !== 401) {
        return result;
    }

    const refreshedAuth = await ensureClientAuth(true);
    if (!refreshedAuth) {
        return result;
    }

    result = await makeRequest(refreshedAuth);
    return result;
};

export const clearTraktClientAuthCache = () => {
    cachedAuth = null;
    lastNoAuthReason = "not_connected";
};

export const warmTraktClientAuth = async () => {
    try {
        await ensureClientAuth(false);
    } catch {
    }
};

export const traktScrobbleClient = async (args: TraktScrobbleArgs) => {
    if (isLocalModeActive()) return { ok: false, reason: "local_mode" };
    if (!canUseCloudFeatures()) return { ok: false, reason: "cloud_unavailable" };

    const progress = Math.max(0, Math.min(100, Number(args.progress) || 0));
    const payload: Record<string, any> = {
        progress,
    };

    if (typeof args.appVersion === "string" && args.appVersion.trim()) {
        payload.app_version = args.appVersion.trim();
    }

    if (args.mediaType === "movie") {
        payload.movie = {
            ids: {
                imdb: args.imdbId,
            },
        };
    } else {
        const season = Number(args.season);
        const episode = Number(args.episode);
        if (!Number.isFinite(season) || !Number.isFinite(episode)) {
            return { ok: false, reason: "missing_episode" };
        }
        payload.show = {
            ids: {
                imdb: args.imdbId,
            },
        };
        payload.episode = {
            season,
            number: episode,
        };
    }

    try {
        const result = await traktRequest(`/scrobble/${args.action}`, {
            method: "POST",
            body: JSON.stringify(payload),
        });

        if (!result) {
            return {
                ok: false,
                reason: lastNoAuthReason || "not_connected",
            };
        }

        if (result.response.ok) {
            return {
                ok: true,
                duplicate: false,
                action: args.action,
            };
        }

        if (result.response.status === 409) {
            return {
                ok: true,
                duplicate: true,
                action: args.action,
            };
        }

        return {
            ok: false,
            reason: "trakt_error",
            status: result.response.status,
            message: getTraktErrorMessage(result.response.status, result.body),
        };
    } catch (error: any) {
        return {
            ok: false,
            reason: "exception",
            message: String(error?.message || error || "Unknown error"),
        };
    }
};

export const getTraktRecommendationsClient = async (limit = 24): Promise<TraktRecommendation[]> => {
    if (isLocalModeActive() || !canUseCloudFeatures()) return [];

    const requestedLimit = Number(limit);
    const normalizedLimit = Math.max(1, Math.min(80, Number.isFinite(requestedLimit) ? requestedLimit : 24));
    const perType = Math.max(1, Math.ceil(normalizedLimit / 2));

    try {
        const [movieResult, showResult] = await Promise.all([
            traktRequest(`/recommendations/movies?limit=${perType}&ignore_collected=true`, {
                method: "GET",
            }),
            traktRequest(`/recommendations/shows?limit=${perType}&ignore_collected=true`, {
                method: "GET",
            }),
        ]);

        if (!movieResult && !showResult) {
            return [];
        }

        const recommendations: TraktRecommendation[] = [];

        const movieItems = Array.isArray(movieResult?.body) ? movieResult.body : [];
        for (const item of movieItems) {
            const movie = item?.movie && typeof item.movie === "object" ? item.movie : item;
            const imdbId = typeof movie?.ids?.imdb === "string" ? movie.ids.imdb : null;
            if (!imdbId) continue;
            recommendations.push({
                imdbId,
                type: "movie",
                title: typeof movie?.title === "string" ? movie.title : null,
                year: Number.isFinite(Number(movie?.year)) ? Number(movie.year) : null,
            });
        }

        const showItems = Array.isArray(showResult?.body) ? showResult.body : [];
        for (const item of showItems) {
            const show = item?.show && typeof item.show === "object" ? item.show : item;
            const imdbId = typeof show?.ids?.imdb === "string" ? show.ids.imdb : null;
            if (!imdbId) continue;
            recommendations.push({
                imdbId,
                type: "series",
                title: typeof show?.title === "string" ? show.title : null,
                year: Number.isFinite(Number(show?.year)) ? Number(show.year) : null,
            });
        }

        const deduped = new Map<string, TraktRecommendation>();
        for (const item of recommendations) {
            if (!deduped.has(item.imdbId)) {
                deduped.set(item.imdbId, item);
            }
        }

        return Array.from(deduped.values()).slice(0, normalizedLimit);
    } catch {
        return [];
    }
};