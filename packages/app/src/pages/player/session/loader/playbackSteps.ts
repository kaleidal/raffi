import { get } from "svelte/store";
import type { ClientPlaybackController } from "../../../../lib/media";
import type { Track } from "../../types";
import * as Session from "../videoSession";
import * as Subtitles from "../../subtitles/subtitles";
import { autoEnableDefaultSubtitles } from "../../subtitles/subtitleAutoSelect";
import {
    isPlaying,
    loading,
    loadingStage,
    loadingDetails,
    playbackBuffering,
    showCanvas,
    showError,
    errorMessage,
    errorDetails,
    subtitleTracks,
    pendingSeek,
    seekGuard,
    firstSeekLoad,
} from "../../playerState";

export const attachSeekHandler = (
    videoElem: HTMLVideoElement,
    getPlaybackController: () => ClientPlaybackController | null,
) => {
    Session.attachSeekingListener(
        videoElem,
        Session.createSeekHandler(
            videoElem,
            () => get(pendingSeek),
            () => get(seekGuard),
            {
                setPendingSeek: pendingSeek.set,
                setSeekGuard: seekGuard.set,
                setBuffering: playbackBuffering.set,
                setShowCanvas: showCanvas.set,
                setFirstSeekLoad: firstSeekLoad.set,
                setShowError: showError.set,
                setErrorMessage: errorMessage.set,
                setErrorDetails: errorDetails.set,
            },
            getPlaybackController,
            () => get(isPlaying),
        ),
    );
};

export const enableDefaultSubtitles = (
    sessionData: any,
    videoElem: HTMLVideoElement,
    cueLinePercent: number,
) =>
    autoEnableDefaultSubtitles({
        sessionData,
        subtitleTracksValue: get(subtitleTracks),
        videoElem,
        cueLinePercent,
        setSubtitleTracks: (updater: (tracks: Track[]) => Track[]) =>
            subtitleTracks.update(updater),
        handleSubtitleSelect: Subtitles.handleSubtitleSelect,
    });

export const hideLoadingScreen = () => {
    loading.set(false);
    loadingStage.set("");
    loadingDetails.set("");
    showCanvas.set(false);
};
