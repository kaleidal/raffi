// Player control handlers and keyboard shortcuts
import type { SeekFeedback } from "./types";

const IDLE_DELAY = 5000;

export function createControlsManager(
    playerContainer: HTMLDivElement | null,
    videoElem: HTMLVideoElement | null,
    isWatchPartyActive: boolean,
    isWatchPartyHost: boolean
) {
    let hideTimeout: ReturnType<typeof setTimeout> | null = null;
    let seekFeedbackTimeout: any = null;
    let pinned = false;

    function clearHideTimer() {
        if (hideTimeout) clearTimeout(hideTimeout);
        hideTimeout = null;
    }

    function setPinned(
        nextPinned: boolean,
        setControlsVisible: (visible: boolean) => void
    ) {
        pinned = nextPinned;
        setControlsVisible(true);
        clearHideTimer();
        if (!pinned) {
            resetHideTimer(setControlsVisible);
        }
    }

    function resetHideTimer(setControlsVisible: (visible: boolean) => void) {
        setControlsVisible(true);
        clearHideTimer();
        if (pinned) return;
        hideTimeout = setTimeout(() => {
            setControlsVisible(false);
        }, IDLE_DELAY);
    }

    function handleMouseMove(setControlsVisible: (visible: boolean) => void) {
        if (pinned) {
            setControlsVisible(true);
            clearHideTimer();
            return;
        }
        resetHideTimer(setControlsVisible);
    }

    function togglePlay(setControlsVisible: (visible: boolean) => void) {
        if (!videoElem) return;
        // Disable for participants
        if (isWatchPartyActive && !isWatchPartyHost) return;

        if (videoElem.paused) {
            void videoElem.play();
        } else {
            videoElem.pause();
        }
        resetHideTimer(setControlsVisible);
    }

    function onSeekInput(
        event: Event,
        duration: number,
        setPendingSeek: (time: number) => void
    ) {
        // Disable for participants
        if (isWatchPartyActive && !isWatchPartyHost) return;

        const value = Number((event.target as HTMLInputElement).value);
        const seekBarStyle = localStorage.getItem("seek_bar_style") || "raffi";
        
        let desiredGlobal;
        if (seekBarStyle === "normal") {
            desiredGlobal = value;
        } else {
            desiredGlobal = Math.max(
                0,
                Math.min(duration, duration - value),
            );
        }

        setPendingSeek(desiredGlobal);
    }

    function onSeekChange(event: Event, duration: number, performSeek: (time: number) => void) {
        const value = Number((event.target as HTMLInputElement).value);
        const seekBarStyle = localStorage.getItem("seek_bar_style") || "raffi";

        let desiredGlobal;
        if (seekBarStyle === "normal") {
            desiredGlobal = value;
        } else {
            desiredGlobal = duration - value;
        }
        
        performSeek(desiredGlobal);
    }

    function onVolumeChange(event: Event, setVolume: (vol: number) => void) {
        if (!videoElem) return;
        const v = Number((event.target as HTMLInputElement).value);
        setVolume(v);
        videoElem.volume = v;
    }

    async function toggleFullscreen() {
        if (!document.fullscreenElement) {
            await playerContainer?.requestFullscreen?.();
        } else {
            await document.exitFullscreen();
        }
    }

    function handleKeydown(
        event: KeyboardEvent,
        currentTime: number,
        duration: number,
        volume: number,
        performSeek: (time: number) => void,
        setVolume: (vol: number) => void,
        setSeekFeedback: (feedback: SeekFeedback | null) => void,
        togglePlayFn: () => void
    ) {
        // Disable controls for participants
        if (isWatchPartyActive && !isWatchPartyHost) return;

        if (event.code === "Space") {
            event.preventDefault();
            togglePlayFn();
        } else if (event.code === "ArrowLeft") {
            const seekBarStyle = localStorage.getItem("seek_bar_style") || "raffi";
            if (seekBarStyle === "normal") {
                // Backward 5s
                performSeek(currentTime - 5);
                if (seekFeedbackTimeout) clearTimeout(seekFeedbackTimeout);
                setSeekFeedback({ type: "backward", id: Date.now() });
                seekFeedbackTimeout = setTimeout(() => setSeekFeedback(null), 500);
            } else {
                // Forward 5s (inverted)
                performSeek(currentTime + 5);
                if (seekFeedbackTimeout) clearTimeout(seekFeedbackTimeout);
                setSeekFeedback({ type: "forward", id: Date.now() });
                seekFeedbackTimeout = setTimeout(() => setSeekFeedback(null), 500);
            }
        } else if (event.code === "ArrowRight") {
            const seekBarStyle = localStorage.getItem("seek_bar_style") || "raffi";
            if (seekBarStyle === "normal") {
                // Forward 5s
                performSeek(currentTime + 5);
                if (seekFeedbackTimeout) clearTimeout(seekFeedbackTimeout);
                setSeekFeedback({ type: "forward", id: Date.now() });
                seekFeedbackTimeout = setTimeout(() => setSeekFeedback(null), 500);
            } else {
                // Backward 5s (inverted)
                performSeek(currentTime - 5);
                if (seekFeedbackTimeout) clearTimeout(seekFeedbackTimeout);
                setSeekFeedback({ type: "backward", id: Date.now() });
                seekFeedbackTimeout = setTimeout(() => setSeekFeedback(null), 500);
            }
        } else if (event.code === "ArrowUp") {
            const newVolume = Math.min(1, volume + 0.1);
            setVolume(newVolume);
            if (videoElem) videoElem.volume = newVolume;
        } else if (event.code === "ArrowDown") {
            const newVolume = Math.max(0, volume - 0.1);
            setVolume(newVolume);
            if (videoElem) videoElem.volume = newVolume;
        } else if (event.code === "Escape") {
            toggleFullscreen();
        } else if (event.code === "KeyF") {
            toggleFullscreen();
        }
    }

    function toggleObjectFit(
        objectFit: "contain" | "cover",
        setObjectFit: (fit: "contain" | "cover") => void
    ) {
        setObjectFit(objectFit === "contain" ? "cover" : "contain");
    }

    return {
        resetHideTimer,
        handleMouseMove,
        setPinned,
        togglePlay,
        onSeekInput,
        onSeekChange,
        onVolumeChange,
        toggleFullscreen,
        handleKeydown,
        toggleObjectFit,
    };
}
