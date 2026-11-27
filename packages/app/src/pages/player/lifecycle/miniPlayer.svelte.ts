import { onDestroy, onMount } from "svelte";

/** Mirrors the desktop mini player window and tells the shell when the player may shrink into it. */
export function createMiniPlayer({
    isEnabled,
    hasPlayback,
    isPlaying,
}: {
    isEnabled: () => boolean;
    hasPlayback: () => boolean;
    isPlaying: () => boolean;
}) {
    const windowControls = window.electronAPI?.windowControls;
    let active = $state(false);
    const canEnter = $derived(isEnabled() && hasPlayback() && (isPlaying() || active));

    onMount(() => {
        const removeChanged = windowControls?.onMiniPlayerChanged?.((value) => (active = value));
        void windowControls?.isMiniPlayer?.().then((value) => (active = value));
        return () => {
            if (typeof removeChanged === "function") removeChanged();
        };
    });

    $effect(() => {
        windowControls?.syncMiniPlayerState?.({ enabled: isEnabled(), canEnter });
    });

    $effect(() => {
        if (active && !canEnter) windowControls?.exitMiniPlayer?.();
    });

    onDestroy(() => {
        windowControls?.syncMiniPlayerState?.({ enabled: false, canEnter: false });
        windowControls?.exitMiniPlayer?.();
    });

    return {
        get active() {
            return active;
        },
        exit: () => windowControls?.exitMiniPlayer?.(),
    };
}
