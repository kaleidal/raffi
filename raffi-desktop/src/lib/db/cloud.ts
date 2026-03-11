import { convexAction, convexMutation, convexQuery } from "./convex";
import type { TraktRecommendation, TraktScrobbleArgs, TraktStatus, WatchParty, WatchPartyMember } from "./types";
import { DEFAULT_TRAKT_STATUS, canUseCloudFeatures, getRequiredUserId, isLocalModeActive } from "./state";

export const getTraktStatus = async (): Promise<TraktStatus> => {
    if (isLocalModeActive() || !canUseCloudFeatures()) return DEFAULT_TRAKT_STATUS;
    getRequiredUserId();
    const status = await convexQuery<TraktStatus>("raffi:getTraktStatus", {});
    return status || DEFAULT_TRAKT_STATUS;
};

export const exchangeTraktCode = async (code: string) => {
    if (!canUseCloudFeatures()) throw new Error("Cloud backup is offline");
    getRequiredUserId();
    return convexAction("raffi:exchangeTraktCode", { code });
};

export const disconnectTrakt = async () => {
    if (isLocalModeActive() || !canUseCloudFeatures()) return { ok: true };
    getRequiredUserId();
    return convexMutation("raffi:disconnectTrakt", {});
};

export const refreshTraktToken = async () => {
    if (!canUseCloudFeatures()) throw new Error("Cloud backup is offline");
    getRequiredUserId();
    return convexAction("raffi:refreshTraktToken", {});
};

export const traktScrobble = async (args: TraktScrobbleArgs) => {
    if (isLocalModeActive() || !canUseCloudFeatures()) return { ok: false, reason: "cloud_unavailable" };
    getRequiredUserId();
    return convexAction("raffi:traktScrobble", args as any);
};

export const getTraktRecommendations = async (limit = 24): Promise<TraktRecommendation[]> => {
    if (isLocalModeActive() || !canUseCloudFeatures()) return [];
    getRequiredUserId();
    const result = await convexAction<any>("raffi:getTraktRecommendations", { limit });
    return result?.ok && Array.isArray(result.recommendations) ? result.recommendations : [];
};

export const createWatchParty = async (imdbId: string, streamSource: string, season: number | null = null, episode: number | null = null, fileIdx: number | null = null) => {
    if (!canUseCloudFeatures()) throw new Error("Watch Party is unavailable while cloud backup is offline");
    getRequiredUserId();
    return convexMutation<WatchParty>("raffi:createWatchParty", { imdbId, streamSource, season, episode, fileIdx });
};

export const joinWatchParty = async (partyId: string) => {
    if (!canUseCloudFeatures()) throw new Error("Watch Party is unavailable while cloud backup is offline");
    getRequiredUserId();
    return convexMutation("raffi:joinWatchParty", { partyId });
};

export const leaveWatchParty = async (partyId: string) => {
    if (!canUseCloudFeatures()) return { ok: true };
    getRequiredUserId();
    return convexMutation("raffi:leaveWatchParty", { partyId });
};

export const updateWatchPartyState = async (partyId: string, currentTimeSeconds: number, isPlaying: boolean) => {
    if (!canUseCloudFeatures()) return { ok: false, reason: "cloud_unavailable" };
    getRequiredUserId();
    return convexMutation("raffi:updateWatchPartyState", { partyId, currentTimeSeconds, isPlaying });
};

export const getWatchParty = async (partyId: string) => {
    if (!canUseCloudFeatures()) return null;
    return convexQuery<WatchParty | null>("raffi:getWatchParty", { partyId });
};

export const getWatchPartyInfo = async (partyId: string) => {
    if (!canUseCloudFeatures()) return null;
    return convexQuery<any>("raffi:getWatchPartyInfo", { partyId });
};

export const getActiveWatchParties = async () => {
    if (!canUseCloudFeatures()) return [];
    return convexQuery<WatchParty[]>("raffi:getActiveWatchParties", {});
};

export const updateMemberLastSeen = async (partyId: string) => {
    if (!canUseCloudFeatures()) return { ok: false, reason: "cloud_unavailable" };
    getRequiredUserId();
    return convexMutation("raffi:updateMemberLastSeen", { partyId });
};

export const getWatchPartyMembers = async (partyId: string) => {
    if (!canUseCloudFeatures()) return [];
    return convexQuery<WatchPartyMember[]>("raffi:getWatchPartyMembers", { partyId });
};