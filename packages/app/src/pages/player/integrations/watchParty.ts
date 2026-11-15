import { get } from "svelte/store";
import {
    hostPlayback,
    hostPositionNow,
    leaveWatchParty,
    setPartyEndCallback,
    updatePlaybackState as sendHostState,
    watchParty,
} from "../../../lib/watchParty/store";

const FOLLOW_INTERVAL_MS = 500;
const HOST_HEARTBEAT_MS = 3000;
const SEEK_SETTLE_MS = 1500;
const SEEK_BEYOND_S = 2;
const DRIFTING_S = 0.25;
const SETTLED_S = 0.08;
const NUDGE_GAIN = 0.2;
const MAX_NUDGE = 0.08;

type PartyPlayer = {
    video: HTMLVideoElement;
    seek: (time: number) => void;
    currentTime: () => number;
    isPlaying: () => boolean;
    /** Loading, buffering or seeking, when the position can't be trusted yet. */
    isBusy: () => boolean;
};

let lastSent = { playing: false, at: 0 };

export function updatePlaybackState(position: number, playing: boolean) {
    lastSent = { playing, at: performance.now() };
    sendHostState(position, playing);
}

const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));

/**
 * The host reports where it is, including when it stalls, so guests wait with it.
 * Guests close small gaps by playing a touch faster or slower, and only seek when far off.
 */
export function followWatchParty(player: PartyPlayer) {
    let correcting = false;
    let settleUntil = 0;

    const setRate = (rate: number) => {
        if (player.video.playbackRate !== rate) player.video.playbackRate = rate;
    };

    const report = () => {
        const playing = player.isPlaying() && !player.isBusy();
        const stale = performance.now() - lastSent.at > HOST_HEARTBEAT_MS;
        if (playing !== lastSent.playing || (playing && stale)) updatePlaybackState(player.currentTime(), playing);
    };

    const follow = () => {
        const playback = get(hostPlayback);
        if (!playback || player.isBusy() || performance.now() < settleUntil) return;

        if (playback.playing === player.video.paused) {
            if (playback.playing) void player.video.play().catch(() => undefined);
            else player.video.pause();
        }

        const drift = hostPositionNow(playback) - player.currentTime();
        if (Math.abs(drift) > (playback.playing ? SEEK_BEYOND_S : DRIFTING_S)) {
            setRate(1);
            correcting = false;
            player.seek(hostPositionNow(playback));
            settleUntil = performance.now() + SEEK_SETTLE_MS;
            return;
        }

        if (Math.abs(drift) > DRIFTING_S) correcting = true;
        else if (Math.abs(drift) < SETTLED_S) correcting = false;
        setRate(playback.playing && correcting ? 1 + clamp(drift * NUDGE_GAIN, MAX_NUDGE) : 1);
    };

    const tick = () => {
        const party = get(watchParty);
        if (!party.isActive) setRate(1);
        else if (party.isHost) report();
        else follow();
    };

    const timer = setInterval(tick, FOLLOW_INTERVAL_MS);
    const unsubscribe = hostPlayback.subscribe(() => {
        settleUntil = 0;
        tick();
    });

    return () => {
        clearInterval(timer);
        unsubscribe();
        setRate(1);
    };
}

export function setupPartyEndCallback(
    setShowModal: (show: boolean) => void,
    setReason: (reason: "host_left" | "party_deleted") => void,
) {
    setPartyEndCallback((reason) => {
        setReason(reason);
        setShowModal(true);
    });
}

export { leaveWatchParty };
