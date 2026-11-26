<script lang="ts">
    import type { Snippet } from "svelte";
    import type { ShowResponse } from "../../../lib/library/types/meta_types";
    import PlayerBackButton from "./PlayerBackButton.svelte";
    import PlayerControls, { type PlayerControlsProps } from "./PlayerControls.svelte";
    import PlayerOverlays from "./PlayerOverlays.svelte";
    import PlayerTitle from "./PlayerTitle.svelte";

    let {
        visible,
        metaData,
        season,
        episode,
        skipLabel,
        onSkip,
        hasNextEpisode,
        nextEpisodeHighlighted,
        onNextEpisode,
        showHealthPrompt = false,
        onChooseAnotherStream,
        onKeepWatching,
        onClose,
        controls,
        seek,
        pictureAspect = null,
        panel = $bindable(null),
    }: {
        visible: boolean;
        metaData: ShowResponse | null;
        season: number | null;
        episode: number | null;
        skipLabel: string | null;
        onSkip: () => void;
        hasNextEpisode: boolean;
        nextEpisodeHighlighted: boolean;
        onNextEpisode: () => void;
        showHealthPrompt?: boolean;
        onChooseAnotherStream?: () => void;
        onKeepWatching?: () => void;
        onClose: () => void;
        controls: PlayerControlsProps | null;
        seek?: Snippet;
        pictureAspect?: number | null;
        panel?: HTMLDivElement | null;
    } = $props();

    const WIDEST_FRAME = 16 / 9;
    const NARROWEST_FRAME_PX = 720;

    let width = $state(0);
    let height = $state(0);

    const frameAspect = $derived(
        controls?.objectFit === "cover" || !pictureAspect ? WIDEST_FRAME : Math.min(pictureAspect, WIDEST_FRAME),
    );
    const frameWidth = $derived(width && height ? Math.min(width, Math.max(NARROWEST_FRAME_PX, height * frameAspect)) : null);

    const shown = (from: "top" | "bottom") =>
        visible ? "translate-y-0 opacity-100" : `${from === "top" ? "-translate-y-6" : "translate-y-6"} opacity-0`;
</script>

<div class="pointer-events-none absolute inset-0 z-50 text-ink scheme-dark" bind:clientWidth={width} bind:clientHeight={height}>
    <div class="chrome-scrim chrome-scrim--top absolute inset-x-0 top-0 transition-opacity duration-300 {visible ? 'opacity-100' : 'opacity-0'}"></div>
    <div class="chrome-scrim chrome-scrim--bottom absolute inset-x-0 bottom-0 transition-opacity duration-300 {visible ? 'opacity-100' : 'opacity-0'}"></div>

    <div class="absolute inset-y-0 left-1/2 w-full -translate-x-1/2" style:width={frameWidth ? `${frameWidth}px` : null}>
        <div class="chrome-edge absolute top-0 left-0 transition-[translate,opacity] duration-300 ease-out {shown('top')}" inert={!visible}>
            <PlayerBackButton onclick={onClose} />
        </div>

        <div class="chrome-edge chrome-dock absolute inset-x-0 bottom-0 flex flex-col gap-[clamp(10px,1.2vw,22px)]">
            <div class="flex items-end justify-between gap-6">
                <div class="min-w-0 transition-[translate,opacity] duration-300 ease-out {shown('bottom')}">
                    {#if metaData}
                        <PlayerTitle {metaData} {season} {episode} />
                    {/if}
                </div>
                <div class="pointer-events-auto shrink-0">
                    <PlayerOverlays
                        {skipLabel}
                        {onSkip}
                        showNextEpisode={hasNextEpisode && (visible || nextEpisodeHighlighted)}
                        {nextEpisodeHighlighted}
                        {onNextEpisode}
                        {showHealthPrompt}
                        {onChooseAnotherStream}
                        {onKeepWatching}
                    />
                </div>
            </div>

            {#if controls}
                <div
                    bind:this={panel}
                    class="pointer-events-auto transition-[translate,opacity] duration-300 ease-out {shown('bottom')}"
                    inert={!visible}
                >
                    <PlayerControls {...controls} {seek} />
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
    .chrome-edge {
        padding: clamp(18px, 2.6vw, 48px) clamp(20px, 3.4vw, 64px);
    }

    .chrome-dock {
        padding-bottom: clamp(14px, 2.4vh, 34px);
    }

    .chrome-scrim--top {
        height: clamp(120px, 18vh, 200px);
        background: linear-gradient(to bottom, rgb(0 0 0 / 0.55), transparent);
    }

    .chrome-scrim--bottom {
        height: clamp(240px, 42vh, 460px);
        background: linear-gradient(
            to top,
            rgb(0 0 0 / 0.82),
            rgb(0 0 0 / 0.55) 35%,
            rgb(0 0 0 / 0.18) 70%,
            transparent
        );
    }
</style>
