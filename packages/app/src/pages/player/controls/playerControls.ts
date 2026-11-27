// Player control handlers and keyboard shortcuts
import { get } from "svelte/store";
import { loading, objectFit, showCanvas } from "../playerState";
import { captureFrame } from "../session/videoSession";
import type { SeekFeedback } from "../types";

const IDLE_DELAY = 5000;

export function createControlsManager(
    playerContainer: HTMLDivElement | null,
    videoElem: HTMLVideoElement | null,
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

    /** Controls stay up while the pointer rests on them, so they never slide away from under it. */
    function handleMouseMove(setControlsVisible: (visible: boolean) => void, overControls: boolean) {
        if (pinned || overControls) {
            setControlsVisible(true);
            clearHideTimer();
            return;
        }
        resetHideTimer(setControlsVisible);
    }

    function togglePlay(setControlsVisible: (visible: boolean) => void) {
        if (!videoElem) return;

        if (videoElem.paused) {
            void videoElem.play();
        } else {
            videoElem.pause();
        }
        resetHideTimer(setControlsVisible);
    }

    function onSeekInput(time: number, setPendingSeek: (time: number) => void) {
        setPendingSeek(time);
    }

    function onSeekChange(time: number, performSeek: (time: number) => void) {
        performSeek(time);
    }

    function onVolumeChange(volume: number, setVolume: (vol: number) => void) {
        if (!videoElem) return;
        setVolume(volume);
        videoElem.volume = volume;
    }

    async function toggleFullscreen() {
        const api = (window as any).electronAPI;
        if (api?.toggleFullscreen) {
            api.toggleFullscreen();
        } else {
            if (!document.fullscreenElement) {
                await playerContainer?.requestFullscreen?.();
            } else {
                await document.exitFullscreen();
            }
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
        if (event.code === "Space") {
            event.preventDefault();
            togglePlayFn();
        } else if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
            const type = event.code === "ArrowRight" ? "forward" : "backward";
            performSeek(currentTime + (type === "forward" ? 5 : -5));
            if (seekFeedbackTimeout) clearTimeout(seekFeedbackTimeout);
            setSeekFeedback({ type, id: Date.now() });
            seekFeedbackTimeout = setTimeout(() => setSeekFeedback(null), 500);
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
    };
}

export async function exitFullscreen() {
    const api = window.electronAPI;
    if (api?.isFullscreen && (await api.isFullscreen())) {
        api.toggleFullscreen?.();
        return;
    }
    if (document.fullscreenElement) await document.exitFullscreen();
}

function applyObjectFit(fit: "contain" | "cover", ...surfaces: Array<HTMLElement | undefined>) {
    for (const surface of surfaces) {
        if (!surface) continue;
        surface.style.objectFit = fit;
        surface.style.objectPosition = "center center";
        surface.style.transform = fit === "cover" ? "scale(1.035)" : "none";
        surface.style.transformOrigin = "center center";
    }
}

/** Flips between fitting and filling the frame, covering the switch with a still of the current frame. */
export function switchObjectFit(video: HTMLVideoElement | undefined, canvas: HTMLCanvasElement | undefined) {
    const nextFit = get(objectFit) === "contain" ? "cover" : "contain";
    objectFit.set(nextFit);
    applyObjectFit(nextFit, video, canvas);
    if (!video || !canvas) return;
    captureFrame(video, canvas);
    if (get(showCanvas) || get(loading)) return;
    showCanvas.set(true);
    requestAnimationFrame(() => {
        if (!get(loading)) showCanvas.set(false);
    });
}
