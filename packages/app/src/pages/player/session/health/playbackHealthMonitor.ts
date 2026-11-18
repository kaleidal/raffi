import { get, writable } from "svelte/store";
import { pendingSeek, seekGuard } from "../../playerState";
import {
    LONG_PLAYBACK_STALL_MS,
    STALL_RECOVERY_MS,
    canRecoverStall,
    recordPlaybackStall,
    shouldSuggestAnotherStream,
    type PlaybackStall,
} from "./playbackHealth";

const PROMPT_RECOVERY_MS = 15_000;

type Timer = ReturnType<typeof setTimeout> | null;

const stop = (timer: Timer): null => {
    if (timer) clearTimeout(timer);
    return null;
};

const isSeeking = () => get(seekGuard) || get(pendingSeek) != null;

/** Watches buffering after playback starts: reopens a stuck stream once, and suggests another source when stalls keep coming. */
export function createPlaybackHealthMonitor({
    hasStarted,
    reopenStream,
}: {
    hasStarted: () => boolean;
    reopenStream: () => void;
}) {
    const promptVisible = writable(false);
    let promptDismissed = false;
    let buffering = false;
    let bufferingStartedAt = 0;
    let countsTowardHealth = false;
    let promptTimer: Timer = null;
    let stallRecoveryTimer: Timer = null;
    let promptRecoveryTimer: Timer = null;
    let lastStallRecoveryAt = 0;
    let stalls: PlaybackStall[] = [];

    const recoverStall = () => {
        stallRecoveryTimer = null;
        if (!buffering || isSeeking()) return;
        lastStallRecoveryAt = Date.now();
        reopenStream();
    };

    function bufferStart() {
        if (buffering) return;
        buffering = true;
        bufferingStartedAt = Date.now();
        promptRecoveryTimer = stop(promptRecoveryTimer);
        countsTowardHealth = hasStarted() && !isSeeking();
        if (!countsTowardHealth) return;
        if (canRecoverStall(lastStallRecoveryAt)) {
            stallRecoveryTimer = setTimeout(recoverStall, STALL_RECOVERY_MS);
        }
        if (get(promptVisible) || promptDismissed) return;
        stop(promptTimer);
        promptTimer = setTimeout(() => {
            if (buffering && countsTowardHealth && !promptDismissed) promptVisible.set(true);
        }, LONG_PLAYBACK_STALL_MS);
    }

    function bufferEnd() {
        if (!buffering) return;
        buffering = false;
        stallRecoveryTimer = stop(stallRecoveryTimer);
        promptTimer = stop(promptTimer);
        if (countsTowardHealth && !isSeeking()) {
            stalls = recordPlaybackStall(stalls, Date.now() - bufferingStartedAt);
            if (!promptDismissed && !get(promptVisible) && shouldSuggestAnotherStream(stalls)) {
                promptVisible.set(true);
            }
        }
        countsTowardHealth = false;
        if (!get(promptVisible)) return;
        promptRecoveryTimer = setTimeout(() => {
            promptRecoveryTimer = null;
            if (buffering || !get(promptVisible)) return;
            promptVisible.set(false);
            stalls = [];
        }, PROMPT_RECOVERY_MS);
    }

    function dismiss() {
        promptRecoveryTimer = stop(promptRecoveryTimer);
        promptVisible.set(false);
        promptDismissed = true;
    }

    function reset() {
        stalls = [];
        promptVisible.set(false);
        promptDismissed = false;
        countsTowardHealth = false;
        promptTimer = stop(promptTimer);
        promptRecoveryTimer = stop(promptRecoveryTimer);
    }

    function dispose() {
        promptTimer = stop(promptTimer);
        stallRecoveryTimer = stop(stallRecoveryTimer);
        promptRecoveryTimer = stop(promptRecoveryTimer);
    }

    return { promptVisible, bufferStart, bufferEnd, dismiss, reset, dispose };
}
