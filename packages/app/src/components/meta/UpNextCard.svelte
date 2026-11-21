<script lang="ts">
    import { Play } from "@lucide/svelte";
    import ShapeLoader from "../common/loading/ShapeLoader.svelte";
    import type { Episode } from "../../lib/library/types/meta_types";
    import type { ProgressItem } from "../../pages/meta/types";

    let {
        episode,
        progress,
        starting,
        onPlay,
    }: { episode: Episode; progress: ProgressItem | undefined; starting: boolean; onPlay: () => void } = $props();

    const started = $derived(Boolean(progress && !progress.watched && progress.time > 0 && progress.duration > 0));
    const minutesLeft = $derived(
        started && progress ? Math.max(1, Math.round((progress.duration - progress.time) / 60)) : 0,
    );
    const code = $derived(`S${episode.season}E${episode.episode}`);
</script>

<button
    data-tv-autofocus
    data-focus-ring
    class="group flex w-full max-w-[640px] cursor-pointer items-center gap-[clamp(18px,1.6vw,28px)] text-left disabled:cursor-wait"
    aria-label="{started ? 'Resume' : 'Play'} {code}"
    disabled={starting}
    onclick={onPlay}
>
    <span
        class="relative aspect-video w-[clamp(220px,17vw,320px)] shrink-0 overflow-hidden rounded-[18px] bg-ink/10 transition-[translate,scale,box-shadow] duration-200 group-hover:-translate-y-1 group-hover:shadow-[0_16px_34px_rgba(0,0,0,0.35)] group-active:scale-[0.97]"
    >
        {#if episode.thumbnail}
            <img src={episode.thumbnail} alt="" class="h-full w-full object-cover" />
        {/if}
        <span class="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors duration-200 group-hover:bg-black/35">
            <span
                class="flex size-[clamp(46px,3.3vw,60px)] items-center justify-center rounded-full bg-accent text-on-accent transition-transform duration-200 group-hover:scale-110"
            >
                {#if starting}
                    <ShapeLoader size="26px" />
                {:else}
                    <Play size={24} strokeWidth={2.5} fill="currentColor" class="translate-x-px" />
                {/if}
            </span>
        </span>
        {#if started && progress}
            <span class="absolute inset-x-3 bottom-3 h-1 overflow-hidden rounded-full bg-white/25">
                <span class="block h-full rounded-full bg-accent" style="width: {(progress.time / progress.duration) * 100}%"></span>
            </span>
        {/if}
    </span>

    <span class="flex min-w-0 flex-col gap-1.5">
        <span class="text-[clamp(14px,0.95vw,17px)] font-medium text-ink/60 tabular-nums">
            {code}{started ? ` · ${minutesLeft} min left` : ""}
        </span>
        <span class="line-clamp-2 text-[clamp(20px,1.5vw,28px)] leading-tight font-semibold text-ink">
            {episode.name || `Episode ${episode.episode}`}
        </span>
    </span>
</button>
