import * as Session from "./videoSession";

export const performSeekWithEffects = ({
    targetTime,
    duration,
    playbackOffset,
    videoElem,
    captureFrame,
    onAfterSeek,
    isWatchPartyHost,
    isPlaying,
    updatePlaybackState,
    setPendingSeek,
    setCurrentTime,
    setShowCanvas,
    clientRemuxHardSeek = false,
}: {
    targetTime: number;
    duration: number;
    playbackOffset: number;
    videoElem: HTMLVideoElement;
    captureFrame: () => void;
    onAfterSeek: () => void;
    isWatchPartyHost: boolean;
    isPlaying: boolean;
    updatePlaybackState: (currentTime: number, isPlaying: boolean) => void;
    setPendingSeek: (value: number | null) => void;
    setCurrentTime: (value: number) => void;
    setShowCanvas: (value: boolean) => void;
    clientRemuxHardSeek?: boolean;
}) => {
    Session.performSeek(
        targetTime,
        duration,
        playbackOffset,
        videoElem,
        captureFrame,
        onAfterSeek,
        isWatchPartyHost,
        false,
        isPlaying,
        updatePlaybackState,
        {
            setPendingSeek,
            setCurrentTime,
            setShowCanvas,
            setIgnoreNextSeek: () => {},
        },
        { clientRemuxHardSeek },
    );
};
