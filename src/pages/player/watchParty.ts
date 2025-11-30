// Watch party synchronization logic
import {
    setSyncCallback,
    updatePlaybackState,
    leaveWatchParty,
    setPartyEndCallback,
} from "../../lib/stores/watchPartyStore";

export function setupWatchPartySync(
    videoElem: HTMLVideoElement | null,
    performSeek: (time: number) => void,
    getCurrentTime: () => number,
    setIgnorePlayPause: (value: boolean) => void,
    setIgnoreSeek: (value: boolean) => void
) {
    setSyncCallback((syncTime, syncIsPlaying) => {
        if (!videoElem) return;

        // Seek to sync time if difference is significant
        const timeDiff = Math.abs(getCurrentTime() - syncTime);
        if (timeDiff > 2) {
            setIgnoreSeek(true);
            performSeek(syncTime);
        }

        // Sync play/pause state
        if (syncIsPlaying && videoElem.paused) {
            setIgnorePlayPause(true);
            videoElem.play();
        } else if (!syncIsPlaying && !videoElem.paused) {
            setIgnorePlayPause(true);
            videoElem.pause();
        }
    });
}

export function setupPartyEndCallback(
    setShowModal: (show: boolean) => void,
    setReason: (reason: "host_left" | "party_deleted") => void
) {
    setPartyEndCallback((reason) => {
        setReason(reason);
        setShowModal(true);
    });
}

export { updatePlaybackState, leaveWatchParty };
