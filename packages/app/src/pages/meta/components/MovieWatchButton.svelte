<script lang="ts">
    import { Play } from "@lucide/svelte";
    import BusyIcon from "../../../components/common/loading/BusyIcon.svelte";
    import type { ProgressItem } from "../types";

    let { progress, starting, onPlay }: { progress: ProgressItem | undefined; starting: boolean; onPlay: () => void } = $props();

    const resumable = $derived(Boolean(progress && !progress.watched && progress.time > 0 && progress.duration > 0));
</script>

<button
    data-tv-autofocus
    data-focus-ring
    class="watch-button relative flex cursor-pointer items-center justify-center gap-4 rounded-full bg-accent font-semibold text-on-accent transition-[background-color,scale] duration-150 hover:bg-accent/88 active:scale-96 disabled:cursor-wait"
    disabled={starting}
    onclick={onPlay}
>
    <span class="watch-icon">
        <BusyIcon busy={starting} size="100%">
            <Play size={48} strokeWidth={2} fill="currentColor" />
        </BusyIcon>
    </span>
    <span class="whitespace-nowrap">{resumable ? "Resume" : "Watch Movie"}</span>
    {#if resumable && progress}
        <span class="absolute inset-x-[18%] bottom-[clamp(8px,0.7vw,12px)] h-1 overflow-hidden rounded-full bg-on-accent/15">
            <span class="block h-full rounded-full bg-on-accent/70" style="width: {(progress.time / progress.duration) * 100}%"></span>
        </span>
    {/if}
</button>

<style>
    .watch-button {
        min-height: clamp(64px, 4.6vw, 86px);
        padding: 0 clamp(34px, 3.6vw, 64px);
        font-size: clamp(20px, 1.5vw, 27px);
    }

    .watch-icon {
        width: clamp(24px, 2vw, 36px);
        height: clamp(24px, 2vw, 36px);
    }

    .watch-icon :global(svg) {
        width: 100%;
        height: 100%;
        translate: 2px 0;
    }

    @media (prefers-reduced-motion: reduce) {
        .watch-button:active {
            scale: 1;
        }
    }
</style>
