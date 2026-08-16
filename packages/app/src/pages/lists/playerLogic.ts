import { playerState } from "./listsState";
import { get } from "svelte/store";
import { trackEvent } from "../../lib/analytics";


export function togglePlay() {
    const currentState = get(playerState);
    if (!currentState.playerIframe) return;

    const command = currentState.isPaused ? "playVideo" : "pauseVideo";
    currentState.playerIframe.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func: command, args: [] }),
        "*",
    );

    playerState.update(s => ({ ...s, isPaused: !s.isPaused }));
    trackEvent("list_trailer_play_toggled", { paused: !currentState.isPaused });
}

export function toggleMute() {
    const currentState = get(playerState);
    if (!currentState.playerIframe) return;

    const command = currentState.isMuted ? "unMute" : "mute";
    currentState.playerIframe.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func: command, args: [] }),
        "*",
    );

    playerState.update(s => ({ ...s, isMuted: !s.isMuted }));
    trackEvent("list_trailer_mute_toggled", { muted: !currentState.isMuted });
}


export function setPlayerIframe(iframe: HTMLIFrameElement) {
    playerState.update(s => ({ ...s, playerIframe: iframe }));

    const applyPreferredState = () => {
        const state = get(playerState);
        if (state.playerIframe !== iframe) return;
        iframe.contentWindow?.postMessage(
            JSON.stringify({
                event: "command",
                func: state.isMuted ? "mute" : "unMute",
                args: [],
            }),
            "*",
        );
        iframe.contentWindow?.postMessage(
            JSON.stringify({
                event: "command",
                func: state.isPaused ? "pauseVideo" : "playVideo",
                args: [],
            }),
            "*",
        );
    };

    applyPreferredState();
    setTimeout(applyPreferredState, 250);
    setTimeout(applyPreferredState, 750);
}
