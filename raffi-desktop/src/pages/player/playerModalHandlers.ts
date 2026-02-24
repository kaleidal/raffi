import { get } from "svelte/store";
import { trackEvent } from "../../lib/analytics";
import {
    audioTracks,
    currentAudioLabel,
    currentSubtitleLabel,
    currentTime,
    errorDetails,
    errorMessage,
    firstSeekLoad,
    loading,
    loadingStage,
    pendingSeek,
    playbackOffset,
    seekGuard,
    showAudioSelection,
    showCanvas,
    showError,
    showSubtitleSelection,
    showWatchPartyModal,
    subtitleTracks,
} from "./playerState";
import { getTrackAnalyticsProps } from "./playerAnalytics";
import * as Session from "./videoSession";
import * as Subtitles from "./subtitles";

export const createPlayerModalHandlers = ({
    getSessionId,
    getVideoElem,
    getHls,
    setHls,
    getCueLinePercent,
    getPlaybackAnalyticsProps,
    getVideoSrc,
    loadVideo,
    handleClose,
}: {
    getSessionId: () => string;
    getVideoElem: () => HTMLVideoElement | null | undefined;
    getHls: () => any;
    setHls: (value: any) => void;
    getCueLinePercent: () => number;
    getPlaybackAnalyticsProps: () => Record<string, any>;
    getVideoSrc: () => string | null;
    loadVideo: (src: string) => void | Promise<void>;
    handleClose: () => void;
}) => {
    const onAudioSelect = (detail: any) => {
        trackEvent("audio_track_selected", {
            ...getPlaybackAnalyticsProps(),
            ...getTrackAnalyticsProps(detail, "audio"),
        });

        const videoElem = getVideoElem();
        if (!videoElem) return;

        Session.handleAudioSelect(
            detail,
            get(audioTracks),
            getSessionId(),
            getHls(),
            get(currentTime),
            videoElem,
            (sid, time) =>
                setHls(
                    Session.initHLS(
                        videoElem,
                        sid,
                        time,
                        true,
                        Session.createSeekHandler(
                            videoElem,
                            getHls,
                            sid,
                            () => get(pendingSeek),
                            () => get(seekGuard),
                            () => get(playbackOffset),
                            () => get(subtitleTracks),
                            () => get(currentSubtitleLabel),
                            (track) =>
                                Subtitles.handleSubtitleSelect(
                                    track,
                                    videoElem,
                                    get(currentTime),
                                    get(playbackOffset),
                                    getCueLinePercent,
                                ),
                            {
                                setPendingSeek: pendingSeek.set,
                                setSeekGuard: seekGuard.set,
                                setLoading: loading.set,
                                setShowCanvas: showCanvas.set,
                                setFirstSeekLoad: firstSeekLoad.set,
                                setPlaybackOffset: playbackOffset.set,
                            },
                        ),
                        {
                            setLoading: loading.set,
                            setShowCanvas: showCanvas.set,
                            setPlaybackOffset: playbackOffset.set,
                            setShowError: showError.set,
                            setErrorMessage: errorMessage.set,
                            setErrorDetails: errorDetails.set,
                        },
                    ),
                ),
            {
                setAudioTracks: audioTracks.set,
                setCurrentAudioLabel: currentAudioLabel.set,
                setLoading: loading.set,
                setLoadingStage: loadingStage.set,
            },
        );
    };

    const onSubtitleSelect = (detail: any) => {
        trackEvent("subtitle_selected", {
            ...getPlaybackAnalyticsProps(),
            ...getTrackAnalyticsProps(detail, "subtitles"),
        });

        const videoElem = getVideoElem();
        if (!videoElem) return;

        subtitleTracks.update((tracks) =>
            tracks.map((track) => ({
                ...track,
                selected: track.id === detail.id,
            })),
        );
        currentSubtitleLabel.set(detail.label);
        void Subtitles.handleSubtitleSelect(
            detail,
            videoElem,
            get(currentTime),
            get(playbackOffset),
            getCueLinePercent,
        );
    };

    const onSubtitleDelayChange = ({ seconds }: { seconds: number }) => {
        trackEvent("subtitle_delay_changed", {
            ...getPlaybackAnalyticsProps(),
            delay_seconds: seconds,
        });

        const selected = get(subtitleTracks).find((track) => track.selected);
        if (!selected || selected.id === "off") return;

        const videoElem = getVideoElem();
        if (!videoElem) return;

        void Subtitles.handleSubtitleSelect(
            selected,
            videoElem,
            get(currentTime),
            get(playbackOffset),
            getCueLinePercent,
        );
    };

    const onAddLocalSubtitle = (track: any) => {
        trackEvent("subtitle_local_added", {
            ...getPlaybackAnalyticsProps(),
            format: track?.format ?? null,
        });

        const videoElem = getVideoElem();
        if (!videoElem) return;

        subtitleTracks.update((tracks) => {
            const next = tracks
                .filter(
                    (item) =>
                        !(item.isLocal && String(item.id).startsWith("local:")),
                )
                .map((item) => ({ ...item, selected: false }));
            return [...next, { ...track, selected: true }];
        });
        currentSubtitleLabel.set(track.label);

        void Subtitles.handleSubtitleSelect(
            track,
            videoElem,
            get(currentTime),
            get(playbackOffset),
            getCueLinePercent,
        );
    };

    const onErrorRetry = () => {
        trackEvent("player_error_retry", getPlaybackAnalyticsProps());
        showError.set(false);
        errorMessage.set("");
        errorDetails.set("");
        const src = getVideoSrc();
        if (src) {
            void loadVideo(src);
        }
    };

    const onErrorBack = () => {
        trackEvent("player_error_back", getPlaybackAnalyticsProps());
        showError.set(false);
        handleClose();
    };

    const onCloseAudio = () => showAudioSelection.set(false);
    const onCloseSubtitle = () => showSubtitleSelection.set(false);
    const onCloseWatchParty = () => showWatchPartyModal.set(false);

    const onFileSelected = (file: any) => {
        if (file?.path) {
            void loadVideo(file.path);
        }
    };

    return {
        onAudioSelect,
        onSubtitleSelect,
        onSubtitleDelayChange,
        onAddLocalSubtitle,
        onErrorRetry,
        onErrorBack,
        onCloseAudio,
        onCloseSubtitle,
        onCloseWatchParty,
        onFileSelected,
    };
};
