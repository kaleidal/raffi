import {
    clearActivity as clearRPCActivity,
    setActivity,
    type ActivityDetails,
} from "../../lib/rpc";
import type { ShowResponse } from "../../lib/library/types/meta_types";

const RAFFI_URL = "https://raffi.al";

function validArtworkUrl(value: string | null | undefined): string | undefined {
    if (!value) return undefined;
    try {
        const url = new URL(value);
        return url.protocol === "https:" ? url.toString() : undefined;
    } catch {
        return undefined;
    }
}

function playbackProgress(duration: number, currentTime: number): number | null {
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(currentTime)) {
        return null;
    }
    return Math.round(Math.min(1, Math.max(0, currentTime / duration)) * 100);
}

export function buildDiscordActivity(
    metaData: ShowResponse | null,
    season: number | null,
    episode: number | null,
    duration: number,
    currentTime: number,
    isPlaying: boolean,
    now = Math.floor(Date.now() / 1_000),
): ActivityDetails | null {
    if (!metaData) return null;

    const { meta } = metaData;
    const isSeries = meta.type === "series";
    const episodeMeta = isSeries
        ? meta.videos?.find(
            (video) => video.season === season && video.episode === episode,
        )
        : undefined;
    const progress = playbackProgress(duration, currentTime);
    const context = isSeries && season != null && episode != null
        ? `S${season} E${episode}${episodeMeta?.name ? ` · ${episodeMeta.name}` : ""}`
        : meta.year || "Movie";
    const state = [
        isPlaying ? context : `Paused · ${context}`,
        progress != null ? `${progress}%` : null,
    ].filter(Boolean).join(" · ");
    const artwork = validArtworkUrl(meta.poster) || validArtworkUrl(episodeMeta?.thumbnail);
    const hasTimeline = isPlaying && progress != null;

    return {
        type: 3,
        statusDisplayType: 2,
        details: meta.name,
        state,
        startTimestamp: hasTimeline
            ? now - Math.floor(Math.max(0, currentTime))
            : undefined,
        endTimestamp: hasTimeline
            ? now + Math.floor(Math.max(0, duration - currentTime))
            : undefined,
        largeImageKey: artwork || "raffi_logo",
        largeImageText: meta.name,
        smallImageKey: isPlaying ? "play" : "pause",
        smallImageText: isPlaying ? "Watching with Raffi" : "Paused in Raffi",
        buttons: [
            { label: "Download Raffi", url: RAFFI_URL },
            ...(meta.imdb_id
                ? [{
                    label: "View on IMDb",
                    url: `https://www.imdb.com/title/${encodeURIComponent(meta.imdb_id)}/`,
                }]
                : []),
        ],
        instance: false,
    };
}

export function updateDiscordActivity(
    metaData: ShowResponse | null,
    season: number | null,
    episode: number | null,
    duration: number,
    currentTime: number,
    isPlaying: boolean,
) {
    const activity = buildDiscordActivity(
        metaData,
        season,
        episode,
        duration,
        currentTime,
        isPlaying,
    );
    if (activity) setActivity(activity);
}

export function clearDiscordActivity() {
    clearRPCActivity();
}
