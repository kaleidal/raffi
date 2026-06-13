import type { TraktRecommendation, TraktScrobbleArgs, TraktStatus, WatchParty, WatchPartyMember } from "./types";
import { DEFAULT_TRAKT_STATUS, canUseCloudFeatures, getRequiredUserId, isLocalModeActive } from "./state";
import {
    clearTraktClientAuthCache,
    getTraktRecommendationsClient,
    traktScrobbleClient,
    warmTraktClientAuth as warmTraktClientAuthInternal,
} from "./traktClient";
import { syncGet, syncPost } from "./raffiSync";

export const getTraktStatus = async (): Promise<TraktStatus> => {
    if (isLocalModeActive() || !canUseCloudFeatures()) return DEFAULT_TRAKT_STATUS;
    getRequiredUserId();
    const status = await syncGet<TraktStatus>("/trakt/status");
    return status || DEFAULT_TRAKT_STATUS;
};

export const exchangeTraktCode = async (code: string) => {
    if (!canUseCloudFeatures()) throw new Error("Cloud backup is offline");
    getRequiredUserId();
    const result = await syncPost("/trakt/exchange-code", { code });
    clearTraktClientAuthCache();
    return result;
};

export const disconnectTrakt = async () => {
    if (isLocalModeActive() || !canUseCloudFeatures()) return { ok: true };
    getRequiredUserId();
    const result = await syncPost("/trakt/disconnect", {});
    clearTraktClientAuthCache();
    return result;
};

export const refreshTraktToken = async () => {
    if (!canUseCloudFeatures()) throw new Error("Cloud backup is offline");
    getRequiredUserId();
    const result = await syncPost("/trakt/refresh", {});
    clearTraktClientAuthCache();
    return result;
};

export const traktScrobble = async (args: TraktScrobbleArgs) => {
    return traktScrobbleClient(args);
};

export const getTraktRecommendations = async (limit = 24): Promise<TraktRecommendation[]> => {
    return getTraktRecommendationsClient(limit);
};

export const warmTraktClientAuth = async () => {
    await warmTraktClientAuthInternal();
};

export const createWatchParty = async (imdbId: string, streamSource: string, season: number | null = null, episode: number | null = null, fileIdx: number | null = null) => {
    if (!canUseCloudFeatures()) throw new Error("Watch Party is unavailable while cloud backup is offline");
    getRequiredUserId();
    return syncPost<WatchParty>("/watch-parties", { imdbId, streamSource, season, episode, fileIdx });
};

export const joinWatchParty = async (partyId: string) => {
    if (!canUseCloudFeatures()) throw new Error("Watch Party is unavailable while cloud backup is offline");
    getRequiredUserId();
    return syncPost(`/watch-parties/${encodeURIComponent(partyId)}/join`, {});
};

export const leaveWatchParty = async (partyId: string) => {
    if (!canUseCloudFeatures()) return { ok: true };
    getRequiredUserId();
    return syncPost(`/watch-parties/${encodeURIComponent(partyId)}/leave`, {});
};

export const updateWatchPartyState = async (partyId: string, currentTimeSeconds: number, isPlaying: boolean) => {
    if (!canUseCloudFeatures()) return { ok: false, reason: "cloud_unavailable" };
    getRequiredUserId();
    return syncPost(`/watch-parties/${encodeURIComponent(partyId)}/state`, { currentTimeSeconds, isPlaying });
};

export const getWatchParty = async (partyId: string) => {
    if (!canUseCloudFeatures()) return null;
    return syncGet<WatchParty | null>(`/watch-parties/${encodeURIComponent(partyId)}`);
};

export const getWatchPartyInfo = async (partyId: string) => {
    if (!canUseCloudFeatures()) return null;
    return syncGet<any>(`/watch-parties/${encodeURIComponent(partyId)}`);
};

export const getActiveWatchParties = async () => {
    if (!canUseCloudFeatures()) return [];
    return syncGet<WatchParty[]>("/watch-parties/active");
};

export const updateMemberLastSeen = async (partyId: string) => {
    if (!canUseCloudFeatures()) return { ok: false, reason: "cloud_unavailable" };
    getRequiredUserId();
    return syncPost(`/watch-parties/${encodeURIComponent(partyId)}/heartbeat`, {});
};

export const getWatchPartyMembers = async (partyId: string) => {
    if (!canUseCloudFeatures()) return [];
    return syncGet<WatchPartyMember[]>(`/watch-parties/${encodeURIComponent(partyId)}/members`);
};
