<script lang="ts">
    import { Play } from "@lucide/svelte";
    import BusyIcon from "../../../components/common/loading/BusyIcon.svelte";
    import type { ProgressItem } from "../types";

    let { progress, starting, onPlay }: { progress: ProgressItem | undefined; starting: boolean; onPlay: () => void } = $props();

    const resumable = $derived(Boolean(progress && !progress.watched && progress.time > 0 && progress.duration > 0));
</script>

<div class="watch-shell relative" data-focus-ring>
    <button
        data-tv-autofocus
        class="watch-button relative z-10 flex w-full cursor-pointer flex-row items-center justify-center gap-5 bg-accent/85 font-medium text-on-accent backdrop-blur-2xl transition-colors duration-200 hover:bg-accent/70 disabled:cursor-wait"
        disabled={starting}
        onclick={onPlay}
    >
        <span class="watch-icon flex items-center justify-center">
            <BusyIcon busy={starting} size="100%">
                <Play size={48} strokeWidth={2} fill="currentColor" />
            </BusyIcon>
        </span>
        <span class="whitespace-nowrap">{resumable ? "Resume" : "Watch Movie"}</span>
    </button>
    {#if resumable && progress}
        <div
            class="absolute bottom-0 left-0 z-20 h-1.5 overflow-hidden rounded-full bg-accent"
            style="width: {(progress.time / progress.duration) * 100}%"
        ></div>
    {/if}
</div>

<style>
    .watch-shell {
        border-radius: clamp(30px, 5vw, 50px);
        overflow: hidden;
        transition: scale 140ms cubic-bezier(0.2, 0, 0, 1);
    }

    .watch-shell:has(.watch-button:not(:disabled):active) {
        scale: 0.96;
    }

    .watch-button {
        min-height: clamp(68px, 5vw, 92px);
        padding: clamp(13px, 1.5vw, 20px) clamp(36px, 4.2vw, 76px);
        font-size: clamp(22px, 1.7vw, 30px);
    }

    .watch-icon {
        width: clamp(28px, 2.4vw, 42px);
        height: clamp(28px, 2.4vw, 42px);
    }

    .watch-icon :global(svg) {
        width: 100%;
        height: 100%;
        transform: translateX(2px);
    }

    @media (prefers-reduced-motion: reduce) {
        .watch-shell {
            transition-duration: 0ms;
        }

        .watch-shell:has(.watch-button:not(:disabled):active) {
            scale: 1;
        }
    }
</style>
