// Discord Rich Presence integration
import { setActivity, clearActivity as clearRPCActivity } from "../../lib/rpc";
import type { ShowResponse } from "../../lib/library/types/meta_types";

export function updateDiscordActivity(
    metaData: ShowResponse | null,
    season: number | null,
    episode: number | null,
    duration: number,
    currentTime: number,
    isPlaying: boolean
) {
    if (!metaData) return;

    const isSeries = metaData.meta.type === "series";
    let details = metaData.meta.name;
    let state = isSeries ? `S${season} E${episode}` : "Movie";

    if (isSeries && season && episode && metaData.meta.videos) {
        const ep = metaData.meta.videos.find(
            (v) => v.season === season && v.episode === episode,
        );
        if (ep && ep.name) {
            state += ` - ${ep.name}`;
        }
    }

    if (duration > 0 && isFinite(duration) && isFinite(currentTime)) {
        // Use setProgressBar with remaining time
        const remaining = Math.floor(duration - currentTime);

        const activity: any = {
            useProgressBar: true,
            details: details,
            state: state,
            duration: remaining,
            largeImageKey: "raffi_logo",
            largeImageText: "Raffi",
        };

        if (isPlaying) {
            activity.smallImageKey = "play";
            activity.smallImageText = "Playing";
        } else {
            activity.smallImageKey = "pause";
            activity.smallImageText = "Paused";
        }

        setActivity(activity);
    } else {
        // Fallback for when there's no valid duration
        const activity: any = {
            details: `Watching ${details}`,
            state: state,
            largeImageKey: "raffi_logo",
            largeImageText: "Raffi",
            instance: false,
        };
        setActivity(activity);
    }
}

export function clearDiscordActivity() {
    clearRPCActivity();
}
