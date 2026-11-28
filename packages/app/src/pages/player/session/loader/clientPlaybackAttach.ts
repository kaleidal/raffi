import {
    MediaBunnyPlayback,
    enrichProbedStreamAudio,
} from "../../../../lib/media";
import { isHttpUrl } from "../../../../lib/media/localSource";
import { applyClientAudioTracks } from "../playerSessionMetadata";
import { attachHlsPlayback } from "../hlsPlayback";
import {
    loading,
    loadingStage,
    loadingDetails,
    loadingProgress,
    showError,
    errorMessage,
    errorDetails,
    duration,
    sessionData,
} from "../../playerState";
import type { ClientPlayback } from "./clientPlaybackProbe";
import { attachSeekHandler, enableDefaultSubtitles, hideLoadingScreen } from "./playbackSteps";
import type { PlayerSessionLoaderDeps } from "./sessionLoaderDeps";

type ClientPlaybackAttachContext = {
    videoElem: HTMLVideoElement;
    clientPlayback: ClientPlayback;
    sessionSource: string;
    session: { sessionData: any };
    effectiveStartTime: number;
    signal: AbortSignal;
    isStale: () => boolean;
    deps: PlayerSessionLoaderDeps;
};

const attachAddonHls = async ({
    videoElem,
    sessionSource,
    effectiveStartTime,
    deps,
}: ClientPlaybackAttachContext) => {
    attachSeekHandler(videoElem, deps.getPlaybackController);
    const hlsInstance = await attachHlsPlayback({
        video: videoElem,
        source: sessionSource,
        startTime: effectiveStartTime,
        onReady: hideLoadingScreen,
        onFatalError: (error, failedInstance) => {
            hideLoadingScreen();
            if (deps.getHls() === failedInstance) {
                deps.setHls(null);
            }
            errorMessage.set("HLS playback failed");
            errorDetails.set(error.message);
            showError.set(true);
        },
    });
    deps.setHls(hlsInstance);
};

const attachMediaBunny = async ({
    videoElem,
    clientPlayback,
    sessionSource,
    session,
    effectiveStartTime,
    signal,
    isStale,
    deps,
}: ClientPlaybackAttachContext) => {
    const controller = new MediaBunnyPlayback();
    deps.setPlaybackController(controller);
    const attached = await controller.attach(
        videoElem,
        sessionSource,
        {
            startTime: effectiveStartTime,
            signal,
            meta: clientPlayback.meta,
            audioIndex:
                session.sessionData?.audioIndex ??
                clientPlayback.meta?.preferredAudioIndex ??
                0,
        },
    );
    if (isStale()) {
        await controller.destroy();
        deps.setPlaybackController(null);
        return;
    }
    if (attached.durationSeconds > 0) {
        duration.set(attached.durationSeconds);
    }

    session.sessionData = applyClientAudioTracks(
        attached.meta,
        sessionSource,
        session.sessionData,
        controller.getAudioIndex(),
    );
    sessionData.set(session.sessionData);

    // Fill in disabled/extra container tracks without blocking start.
    void enrichProbedStreamAudio(
        sessionSource,
        attached.meta,
        signal,
    )
        .then((enriched) => {
            if (isStale()) return;
            controller.replaceMeta(enriched);
            session.sessionData = applyClientAudioTracks(
                controller.getMeta() ?? enriched,
                sessionSource,
                session.sessionData,
                controller.getAudioIndex(),
            );
            sessionData.set(session.sessionData);
        })
        .catch(() => {
            // ignore
        });

    attachSeekHandler(videoElem, deps.getPlaybackController);

    hideLoadingScreen();
    videoElem.play().catch(() => {
        // ignore
    });
};

const attachDirect = ({
    videoElem,
    clientPlayback,
    sessionSource,
    session,
    effectiveStartTime,
    signal,
    isStale,
    deps,
}: ClientPlaybackAttachContext) => {
    const onLoaded = () => {
        const currentVideo = deps.getVideoElem();
        if (!currentVideo) return;

        if (
            Number.isFinite(currentVideo.duration) &&
            currentVideo.duration > 0
        ) {
            duration.set(currentVideo.duration);
        } else if ((clientPlayback.meta?.durationSeconds ?? 0) > 0) {
            duration.set(clientPlayback.meta!.durationSeconds);
        }

        if (effectiveStartTime > 0) {
            try {
                currentVideo.currentTime = effectiveStartTime;
            } catch {
                // ignore
            }
        }

        hideLoadingScreen();

        currentVideo.play().catch(() => {
            // ignore
        });
    };

    videoElem.addEventListener("loadedmetadata", onLoaded, {
        once: true,
    });

    if (clientPlayback.meta && isHttpUrl(sessionSource)) {
        videoElem.crossOrigin = "anonymous";
    } else {
        videoElem.removeAttribute("crossorigin");
    }
    attachSeekHandler(videoElem, deps.getPlaybackController);
    videoElem.src = sessionSource;
    videoElem.load();

    if (clientPlayback.meta) {
        void enrichProbedStreamAudio(
            sessionSource,
            clientPlayback.meta,
            signal,
        )
            .then((enriched) => {
                if (isStale()) return;
                clientPlayback.meta = enriched;
                session.sessionData = applyClientAudioTracks(
                    enriched,
                    sessionSource,
                    session.sessionData,
                );
                sessionData.set(session.sessionData);
            })
            .catch(() => {
                // ignore
            });
    }
};

/** Tears down any previous engine and plays the probed source through HLS, a MediaBunny remux or the element itself. */
export async function attachClientPlayback(context: ClientPlaybackAttachContext) {
    const { videoElem, clientPlayback, session, deps } = context;
    loadingStage.set(
        clientPlayback.mode === "mediabunny"
            ? "Remuxing in the app"
            : "Loading stream directly",
    );
    loadingDetails.set(
        clientPlayback.mode === "mediabunny"
            ? "Preparing a browser-compatible stream"
            : "Starting playback",
    );
    loadingProgress.set(null);

    const hls = deps.getHls();
    if (hls) {
        try {
            hls.destroy();
        } catch {
            // ignore
        }
        deps.setHls(null);
    }

    const existingController = deps.getPlaybackController();
    if (existingController) {
        await existingController.destroy();
        deps.setPlaybackController(null);
    }

    void enableDefaultSubtitles(session.sessionData, videoElem).catch(() => {
        // ignore
    });

    loading.set(true);

    if (clientPlayback.mode === "addon-hls") {
        await attachAddonHls(context);
        return;
    }
    if (clientPlayback.mode === "mediabunny") {
        await attachMediaBunny(context);
        return;
    }
    attachDirect(context);
}
