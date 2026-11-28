import type { ProbedStream, ClientPlaybackController } from "../../../../lib/media";
import { toClientPlayableUrl } from "../../../../lib/media/localSource";
import * as Subtitles from "../../subtitles/subtitles";
import { applyClientAudioTracks, embeddedSubtitleTracks, sessionFromProbe } from "../playerSessionMetadata";
import {
    loadingStage,
    loadingDetails,
    loadingProgress,
    playbackBuffering,
    currentTime,
    duration,
    subtitleTracks,
    sessionData,
} from "../../playerState";
import { attachSeekHandler, enableDefaultSubtitles, hideLoadingScreen } from "./playbackSteps";
import type { PlayerSessionLoaderDeps } from "./sessionLoaderDeps";

export type ReusedSession = {
    sessionData: any;
    mode?: "direct" | "mediabunny" | "addon-hls" | "unsupported";
    meta?: ProbedStream | null;
    playbackController?: ClientPlaybackController | null;
    hls?: any;
};

export const canResumeSession = (reused: ReusedSession) =>
    reused.mode === "direct" ||
    reused.mode === "mediabunny" ||
    reused.mode === "addon-hls";

/** Hands an already playing video element (e.g. a prefetched next episode) over to a new session. */
export async function resumeReusedSession({
    src,
    reused,
    startTimeOverride,
    deps,
    isStale,
}: {
    src: string;
    reused: ReusedSession;
    startTimeOverride: number | undefined;
    deps: PlayerSessionLoaderDeps;
    isStale: () => boolean;
}) {
    loadingStage.set("Continuing");
    loadingDetails.set("");
    loadingProgress.set(null);

    const videoElem = deps.getVideoElem();
    if (!videoElem) return;

    const sessionSource = await toClientPlayableUrl(src);
    let nextSession =
        reused.sessionData && typeof reused.sessionData === "object"
            ? { ...reused.sessionData }
            : sessionFromProbe(reused.meta ?? null, sessionSource);

    nextSession = applyClientAudioTracks(
        reused.meta ?? null,
        sessionSource,
        nextSession,
        reused.playbackController?.getAudioIndex?.(),
    );
    sessionData.set(nextSession);

    const metaData = deps.getMetaData();
    const season = deps.getSeason();
    const episode = deps.getEpisode();

    const durationSeconds =
        reused.meta?.durationSeconds ||
        (Number.isFinite(videoElem.duration) ? videoElem.duration : 0) ||
        nextSession.durationSeconds ||
        0;
    if (durationSeconds > 0) {
        duration.set(durationSeconds);
    }

    currentTime.set(videoElem.currentTime);

    subtitleTracks.set([
        { id: "off", label: "Off", selected: true, group: "None" },
        ...embeddedSubtitleTracks(reused.meta ?? null, sessionSource),
    ]);

    if (
        reused.mode === "mediabunny" &&
        reused.playbackController
    ) {
        reused.playbackController.setPrefetching(false);
        deps.setPlaybackController(reused.playbackController);
    } else if (reused.mode === "addon-hls" && reused.hls) {
        deps.setHls(reused.hls);
    } else {
        deps.setPlaybackController(null);
    }
    attachSeekHandler(videoElem, deps.getPlaybackController);
    if (isStale()) return;

    try {
        videoElem.muted = false;
        videoElem.defaultMuted = false;
    } catch {
        // ignore
    }

    hideLoadingScreen();
    playbackBuffering.set(false);
    videoElem.play().catch(() => {
        // ignore
    });

    void deps
        .resolvePlaybackStart({
            sessionData: nextSession,
            startTime: startTimeOverride ?? deps.getStartTime(),
            metaData,
            season,
            episode,
        })
        .then((playbackStart) => {
            if (isStale()) return;
            deps.setIntroDbChapters(playbackStart.introDbChapters);
            if (
                playbackStart.effectiveStartTime > 0 &&
                videoElem.currentTime < playbackStart.effectiveStartTime
            ) {
                videoElem.currentTime = playbackStart.effectiveStartTime;
            }
        })
        .catch(() => {
            // ignore
        });

    void Subtitles.fetchAddonSubtitles(metaData, season, episode)
        .then(async (addonTracks) => {
            if (isStale()) return;
            if (addonTracks.length > 0) {
                subtitleTracks.update((current) => [...current, ...addonTracks]);
            }
            await enableDefaultSubtitles(nextSession, videoElem);
        })
        .catch(() => {
            // ignore
        });
}
