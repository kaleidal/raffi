import type {
    TraktDeviceCode,
    TraktDevicePoll,
    TraktRecommendation,
    TraktScrobbleArgs,
    TraktStatus,
} from "./types";
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

export const startTraktDeviceSignIn = async () => {
    if (!canUseCloudFeatures()) throw new Error("Cloud backup is offline");
    getRequiredUserId();
    return syncPost<TraktDeviceCode>("/trakt/device/start", {});
};

export const pollTraktDeviceSignIn = async (deviceCode: string) => {
    if (!canUseCloudFeatures()) throw new Error("Cloud backup is offline");
    getRequiredUserId();
    const result = await syncPost<TraktDevicePoll>("/trakt/device/poll", { deviceCode });
    if (result.status === "connected") clearTraktClientAuthCache();
    return result;
};

export const disconnectTrakt = async () => {
    if (isLocalModeActive() || !canUseCloudFeatures()) return { ok: true };
    getRequiredUserId();
    const result = await syncPost("/trakt/disconnect", {});
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
