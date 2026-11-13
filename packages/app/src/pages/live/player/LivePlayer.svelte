<script lang="ts">
    import { onDestroy, onMount, tick } from "svelte";
    import { get, writable } from "svelte/store";
    import { fade } from "svelte/transition";
    import { ChevronLeft } from "@lucide/svelte";
    import LoadingSpinner from "../../../components/common/LoadingSpinner.svelte";
    import LiveControls from "./LiveControls.svelte";
    import LiveStatus from "./LiveStatus.svelte";
    import { browserEngine, nativeEngine, STARTING, type EngineStatus, type LiveEngine } from "./engines";
    import { bindLiveMediaSession, clearLiveMediaSession } from "./liveMediaSession";
    import { router } from "../../../lib/stores/router";
    import { onBack } from "../../../lib/android/back";
    import { claimKeys } from "../../../lib/tv/keyClaims";
    import { moveFocusTo } from "../../../lib/tv/spatialNavigation";
    import { isAndroidPlatform, isTvPlatform } from "../../../lib/shell/platform";
    import { findChannel, programmesForChannel, zapOrder } from "../../../lib/live/library";
    import { nowAndNext } from "../../../lib/live/lineup";
    import { liveSettings, toggleFavourite } from "../../../lib/live/sources";
    import type { LiveChannel, Programme } from "../../../lib/live/types";

    export let sourceId: string;
    export let channelId: string;

    const CONTROLS_HIDE_MS = 4000;
    const CLOCK_TICK_MS = 15_000;
    const VOLUME_KEY = "raffi:live-volume";

    let video: HTMLVideoElement;
    let container: HTMLDivElement;
    let controlsPanel: HTMLDivElement;
    let engine: LiveEngine | null = null;
    const status = writable<EngineStatus>(STARTING);
    let channel: LiveChannel | null = null;
    let programmes: Programme[] = [];
    let missing = false;
    let now = Date.now();
    let volume = Number(localStorage.getItem(VOLUME_KEY) ?? 1);
    let objectFit: "contain" | "cover" = "contain";
    let controlsVisible = true;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    let tunedTo = "";

    $: airing = nowAndNext(programmes, now).now;
    $: favourite = $liveSettings.favourites.includes(channelId);
    $: started = !$status.buffering || $status.playing;
    $: if (engine && channelId !== tunedTo) void tune(channelId);
    $: if (video) video.volume = volume;
    $: if (channel) bindLiveMediaSession(channel, airing, { toggle, zap });

    async function tune(id: string) {
        tunedTo = id;
        missing = false;
        const found = await findChannel(sourceId, id);
        if (id !== tunedTo) return;
        if (!found) {
            missing = true;
            return;
        }
        channel = found;
        programmes = [];
        showControls();
        void programmesForChannel(sourceId, found).then((list) => id === tunedTo && (programmes = list));
        await engine?.start(found);
    }

    function zap(step: number) {
        const order = get(zapOrder);
        const index = order.findIndex((entry) => entry.id === channelId);
        if (order.length < 2 || index < 0) return;
        const next = order[(index + step + order.length) % order.length];
        router.navigate("live-player", { sourceId, channelId: next.id }, { replace: true });
    }

    function toggle() {
        engine?.toggle();
        showControls();
    }

    /** A click on desktop pauses like any player; a tap on a phone shows or hides the controls. */
    function tapSurface() {
        if (!isAndroidPlatform) toggle();
        else if (controlsVisible) controlsVisible = false;
        else showControls();
    }

    function close() {
        if (document.fullscreenElement) void document.exitFullscreen();
        if (!router.back()) router.navigate("live");
    }

    async function toggleFullscreen() {
        const api = (window as any).electronAPI;
        if (api?.toggleFullscreen) api.toggleFullscreen();
        else if (document.fullscreenElement) await document.exitFullscreen();
        else await container.requestFullscreen();
    }

    function toggleObjectFit() {
        objectFit = objectFit === "contain" ? "cover" : "contain";
        engine?.setFit(objectFit);
    }

    function setVolume(next: number) {
        volume = Math.min(1, Math.max(0, next));
        localStorage.setItem(VOLUME_KEY, String(volume));
    }

    function scheduleHide() {
        if (hideTimer) clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
            if (get(status).playing) controlsVisible = false;
            else scheduleHide();
        }, CONTROLS_HIDE_MS);
    }

    async function showControls(focus = false) {
        controlsVisible = true;
        scheduleHide();
        if (!focus || !isTvPlatform) return;
        await tick();
        const play = controlsPanel?.querySelector<HTMLElement>("button");
        if (play) moveFocusTo(play);
    }

    function handleKeydown(event: KeyboardEvent) {
        if (isTvPlatform || (event.target as HTMLElement)?.closest("input")) return;
        switch (event.key) {
            case " ":
            case "k":
                event.preventDefault();
                toggle();
                break;
            case "f":
                void toggleFullscreen();
                break;
            case "ArrowUp":
                event.preventDefault();
                setVolume(volume + 0.05);
                showControls();
                break;
            case "ArrowDown":
                event.preventDefault();
                setVolume(volume - 0.05);
                showControls();
                break;
            case "PageUp":
            case "ChannelUp":
                event.preventDefault();
                zap(-1);
                break;
            case "PageDown":
            case "ChannelDown":
                event.preventDefault();
                zap(1);
                break;
            case "Escape":
                if (!document.fullscreenElement) close();
                break;
        }
    }

    /** With the controls hidden, the remote's up and down change channel the way a TV does. */
    function claimRemoteKey(event: KeyboardEvent) {
        if ($status.error || missing) return false;
        switch (event.key) {
            case "ChannelUp":
                zap(-1);
                return true;
            case "ChannelDown":
                zap(1);
                return true;
            case "MediaPlayPause":
                toggle();
                return true;
        }
        if (controlsVisible) {
            scheduleHide();
            return false;
        }
        switch (event.key) {
            case "ArrowUp":
                zap(-1);
                return true;
            case "ArrowDown":
                zap(1);
                return true;
            case "Enter":
            case "ArrowLeft":
            case "ArrowRight":
                void showControls(true);
                return true;
        }
        return false;
    }

    const releaseKeys = isTvPlatform ? claimKeys(claimRemoteKey) : () => {};
    const removeBackHandler = isAndroidPlatform
        ? onBack(() => {
              if (controlsVisible && started && !$status.error) controlsVisible = false;
              else close();
              return true;
          })
        : () => {};

    onMount(() => {
        engine = isAndroidPlatform ? nativeEngine(status) : browserEngine(video, status);
        const clock = setInterval(() => (now = Date.now()), CLOCK_TICK_MS);
        return () => clearInterval(clock);
    });

    onDestroy(() => {
        releaseKeys();
        removeBackHandler();
        if (hideTimer) clearTimeout(hideTimer);
        clearLiveMediaSession();
        engine?.destroy();
    });
</script>

<svelte:window on:keydown={handleKeydown} />

<div
    bind:this={container}
    class="fixed inset-0 z-[150] overflow-hidden {isAndroidPlatform ? '' : 'bg-black'} {controlsVisible ? '' : 'cursor-none'}"
    role="presentation"
    onpointermove={() => showControls()}
>
    {#if !isAndroidPlatform}
        <video bind:this={video} class="absolute inset-0 h-full w-full" style="object-fit:{objectFit}" playsinline></video>
    {/if}

    {#if !isTvPlatform}
        <button
            class="absolute inset-0 cursor-default"
            aria-label={controlsVisible ? "Hide controls" : "Show controls"}
            onclick={tapSurface}
            ondblclick={() => !isAndroidPlatform && toggleFullscreen()}
        ></button>
    {/if}

    {#if $status.error || missing || !started}
        <LiveStatus
            {channel}
            error={missing ? "This channel isn't in your lineup anymore." : $status.error}
            onRetry={() => channel && engine?.start(channel)}
            onBack={close}
        />
    {:else if $status.buffering}
        <div class="pointer-events-none absolute inset-0 flex items-center justify-center" transition:fade={{ duration: 150 }}>
            <LoadingSpinner size="56px" color="#D8D8D8" />
        </div>
    {/if}

    <div
        class="absolute left-0 top-0 z-50 p-4 transition-all duration-300 sm:p-10 {controlsVisible
            ? 'translate-y-0 opacity-100'
            : 'pointer-events-none -translate-y-10 opacity-0'}"
    >
        <button
            class="grid size-[clamp(44px,3.2vw,54px)] place-items-center rounded-full bg-[#000000]/20 backdrop-blur-md transition-colors duration-200 hover:bg-[#FFFFFF]/20 cursor-pointer"
            onclick={close}
            aria-label="Close player"
        >
            <ChevronLeft size={26} color="white" strokeWidth={2} />
        </button>
    </div>

    {#if channel && started && !$status.error}
        <div
            bind:this={controlsPanel}
            class="absolute bottom-[clamp(14px,4.5vh,50px)] left-1/2 z-50 -translate-x-1/2 transition-all duration-300 {controlsVisible
                ? 'translate-y-0 opacity-100'
                : 'pointer-events-none translate-y-10 opacity-0'}"
        >
            <LiveControls
                {channel}
                {airing}
                {now}
                playing={$status.playing}
                {volume}
                {favourite}
                {objectFit}
                togglePlay={toggle}
                onVolumeChange={setVolume}
                toggleFavourite={() => toggleFavourite(channelId)}
                {toggleObjectFit}
                {toggleFullscreen}
            />
        </div>
    {/if}
</div>
