<script lang="ts">
    import { fade } from "svelte/transition";
    import { AudioWaveform, Pause, Play, SkipForward, Subtitles, ZoomIn, ZoomOut } from "@lucide/svelte";
    import TvSeekBar from "./TvSeekBar.svelte";
    import type { Chapter } from "../types";
    import type { NativePlaybackState } from "./nativePlayback";

    export let title: string;
    export let subtitle: string | null = null;
    export let state: NativePlaybackState;
    export let chapters: Chapter[] = [];
    export let invertedSeek = false;
    export let audioLabel = "";
    export let subtitleLabel = "";
    export let skipLabel: string | null = null;
    export let hasNextEpisode = false;
    export let fit: "contain" | "cover" = "contain";
    export let seekBar: TvSeekBar | null = null;
    export let seekElement: HTMLDivElement | null = null;
    export let playButton: HTMLButtonElement | null = null;
    export let panel: HTMLDivElement | null = null;

    export let onToggle: () => void;
    export let onSeek: (time: number) => void;
    export let onScrubbingChange: (scrubbing: boolean) => void;
    export let onSkip: () => void;
    export let onNextEpisode: () => void;
    export let onAudio: () => void;
    export let onSubtitles: () => void;
    export let onToggleFit: () => void;

    const control =
        "flex h-13 shrink-0 items-center gap-2.5 rounded-full bg-white/10 px-6 font-poppins text-[17px] font-medium text-white transition-colors focus:bg-white focus:text-black";

    $: buffered = state.duration > 0 ? [{ start: 0, end: state.buffered }] : [];
</script>

<div
    class="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center pb-[var(--raffi-page-gutter)]"
    transition:fade={{ duration: 160 }}
>
    <div
        bind:this={panel}
        class="pointer-events-auto flex w-[min(1180px,calc(100vw-2*var(--raffi-page-gutter)))] flex-col gap-6 rounded-[32px] bg-[#0d0d0d]/85 px-9 py-7 text-white"
    >
        <div class="flex min-w-0 items-baseline gap-4">
            <h2 class="truncate font-poppins text-2xl font-semibold">{title}</h2>
            {#if subtitle}
                <span class="truncate text-lg text-white/55">{subtitle}</span>
            {/if}
        </div>

        <TvSeekBar
            bind:this={seekBar}
            bind:element={seekElement}
            time={state.position}
            duration={state.duration}
            {buffered}
            {chapters}
            inverted={invertedSeek}
            onCommit={onSeek}
            {onScrubbingChange}
        />

        <div class="flex items-center gap-3">
            <button
                bind:this={playButton}
                class="{control} px-5"
                data-own-focus
                aria-label={state.playWhenReady ? "Pause" : "Play"}
                on:click={onToggle}
            >
                {#if state.playWhenReady}
                    <Pause size={24} fill="currentColor" strokeWidth={0} />
                {:else}
                    <Play size={24} fill="currentColor" strokeWidth={0} />
                {/if}
            </button>

            {#if skipLabel}
                <button class={control} data-own-focus on:click={onSkip}>
                    <SkipForward size={20} strokeWidth={2} />
                    {skipLabel}
                </button>
            {/if}

            {#if hasNextEpisode}
                <button class={control} data-own-focus on:click={onNextEpisode}>
                    <SkipForward size={20} strokeWidth={2} />
                    Next Episode
                </button>
            {/if}

            <div class="flex-1"></div>

            <button class={control} data-own-focus on:click={onAudio}>
                <AudioWaveform size={20} strokeWidth={2} />
                <span class="max-w-56 truncate">{audioLabel || "Audio"}</span>
            </button>
            <button class={control} data-own-focus on:click={onSubtitles}>
                <Subtitles size={20} strokeWidth={2} />
                <span class="max-w-56 truncate">{subtitleLabel}</span>
            </button>
            <button
                class="{control} px-5"
                data-own-focus
                aria-label={fit === "contain" ? "Fill screen" : "Fit to screen"}
                on:click={onToggleFit}
            >
                {#if fit === "contain"}
                    <ZoomIn size={22} strokeWidth={2} />
                {:else}
                    <ZoomOut size={22} strokeWidth={2} />
                {/if}
            </button>
        </div>
    </div>
</div>
