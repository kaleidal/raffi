import { traktScrobble } from "../../lib/db/db";

export const TRAKT_COMPLETION_THRESHOLD = 0.9;
const TRAKT_FAILURE_COOLDOWN_MS = 60_000;
const TRAKT_MAX_FAILURES = 3;

export const createTraktScrobbler = ({
    isLocalMode,
    getImdbId,
    getHasStarted,
    getMediaType,
    getSeasonEpisode,
    getProgress,
}: {
    isLocalMode: () => boolean;
    getImdbId: () => string | null;
    getHasStarted: () => boolean;
    getMediaType: () => "movie" | "episode";
    getSeasonEpisode: () => { season: number | null; episode: number | null };
    getProgress: () => number;
}) => {
    let lastAction: "start" | "pause" | "stop" | null = null;
    let lastActionAt = 0;
    let stopSent = false;
    let startSent = false;
    let disabledForSession = false;
    let failureCount = 0;
    let cooldownUntil = 0;

    const send = async (action: "start" | "pause" | "stop", force = false) => {
        const imdbId = getImdbId();
        if (isLocalMode() || !imdbId) return;
        if (!getHasStarted()) return;
        if (disabledForSession) return;
        if (!force && Date.now() < cooldownUntil) return;
        if (action === "pause" && !startSent) return;

        const mediaType = getMediaType();
        const { season, episode } = getSeasonEpisode();
        if (mediaType === "episode" && (season == null || episode == null)) return;

        const now = Date.now();
        if (!force && action === lastAction && now - lastActionAt < 10_000) {
            return;
        }

        lastAction = action;
        lastActionAt = now;

        if (action === "stop") {
            stopSent = true;
        } else if (action === "start") {
            stopSent = false;
        }

        try {
            const result: any = await traktScrobble({
                action,
                imdbId,
                mediaType,
                season: mediaType === "episode" ? season ?? undefined : undefined,
                episode: mediaType === "episode" ? episode ?? undefined : undefined,
                progress: getProgress(),
                appVersion: "desktop",
            });

            if (result?.ok) {
                failureCount = 0;
                cooldownUntil = 0;
                if (action === "start") {
                    startSent = true;
                }
                return;
            }

            const reason = String(result?.reason || "");
            if (
                reason === "not_connected" ||
                reason === "not_configured" ||
                reason === "missing_episode" ||
                reason === "local_mode"
            ) {
                disabledForSession = true;
                return;
            }

            failureCount += 1;
            if (failureCount >= TRAKT_MAX_FAILURES) {
                cooldownUntil = Date.now() + TRAKT_FAILURE_COOLDOWN_MS;
                failureCount = 0;
            }
        } catch {
            failureCount += 1;
            if (failureCount >= TRAKT_MAX_FAILURES) {
                cooldownUntil = Date.now() + TRAKT_FAILURE_COOLDOWN_MS;
                failureCount = 0;
            }
        }
    };

    return {
        send,
        isStopSent: () => stopSent,
    };
};
