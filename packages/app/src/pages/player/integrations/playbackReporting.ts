import { get } from "svelte/store";
import type { ShowResponse } from "../../../lib/library/types/meta_types";
import { localMode } from "../../../lib/stores/authStore";
import { progressMap } from "../../meta/metaState";
import * as ProgressLogic from "../../meta/progressLogic";
import { currentTime, duration } from "../playerState";
import { createTraktScrobbler } from "./traktScrobbleManager";

type MediaContext = { metaData: ShowResponse | null; season: number | null; episode: number | null };

/** Reports how far the viewer got, to the library and to Trakt. */
export function createPlaybackReporting({
    imdbId,
    hasStarted,
    getMediaContext,
}: {
    imdbId: string | null;
    hasStarted: () => boolean;
    getMediaContext: () => MediaContext;
}) {
    const trakt = createTraktScrobbler({
        isLocalMode: () => get(localMode),
        getImdbId: () => imdbId,
        getHasStarted: hasStarted,
        getMediaType: () => (getMediaContext().metaData?.meta?.type === "series" ? "episode" : "movie"),
        getSeasonEpisode: () => {
            const { season, episode } = getMediaContext();
            return { season, episode };
        },
        getProgress: () => {
            const total = get(duration);
            return total > 0 ? Math.max(0, Math.min(100, (get(currentTime) / total) * 100)) : 0;
        },
    });

    const reportProgress = (time: number, total: number) => {
        if (imdbId) ProgressLogic.handleProgress(time, total, imdbId, hasStarted());
    };

    const stopTrakt = () => {
        if (hasStarted() && !trakt.isStopSent()) void trakt.send("stop", true);
    };

    /** Rewatching a finished episode starts tracking it again from the current position. */
    const clearWatchedProgress = (video: HTMLVideoElement) => {
        const { metaData, season, episode } = getMediaContext();
        const progressKey = metaData?.meta?.type === "series" && season != null && episode != null ? `${season}:${episode}` : undefined;
        if (!ProgressLogic.getProgress(get(progressMap), progressKey)?.watched) return;
        reportProgress(video.currentTime, get(duration));
    };

    return { trakt, reportProgress, stopTrakt, clearWatchedProgress };
}
