<script lang="ts">
    import { Play } from "@lucide/svelte";
    import type { Episode } from "../../lib/library/types/meta_types";
    import type { ProgressItem } from "../../pages/meta/types";

    let { episode, progress, onPlay }: { episode: Episode; progress: ProgressItem | undefined; onPlay: () => void } = $props();

    const started = $derived(Boolean(progress && !progress.watched && progress.time > 0 && progress.duration > 0));
    const minutesLeft = $derived(
        started && progress ? Math.max(1, Math.round((progress.duration - progress.time) / 60)) : 0,
    );
</script>

<button class="group mb-[clamp(32px,3vw,56px)] flex w-full cursor-pointer items-center gap-[clamp(20px,2.2vw,40px)] text-left" onclick={onPlay}>
    <span class="relative aspect-video w-[clamp(220px,26vw,460px)] shrink-0 overflow-hidden rounded-[20px] bg-surface transition-[translate,box-shadow] duration-200 group-hover:-translate-y-1 group-hover:shadow-[0_14px_30px_rgba(0,0,0,0.3)]">
        {#if episode.thumbnail}
            <img src={episode.thumbnail} alt="" class="h-full w-full object-cover" />
        {/if}
        <span class="absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <span class="flex size-14 items-center justify-center rounded-full bg-accent text-on-accent">
                <Play size={24} strokeWidth={2.5} fill="currentColor" />
            </span>
        </span>
        {#if started && progress}
            <span class="absolute inset-x-3 bottom-3 h-1 overflow-hidden rounded-full bg-white/25">
                <span class="block h-full rounded-full bg-accent" style="width: {(progress.time / progress.duration) * 100}%"></span>
            </span>
        {/if}
    </span>

    <span class="flex min-w-0 flex-col gap-1.5">
        <span class="text-sm text-ink/55 tabular-nums">
            S{episode.season}E{episode.episode}{started ? ` · ${minutesLeft} min left` : ""}
        </span>
        <span class="text-[clamp(20px,1.6vw,30px)] leading-tight font-semibold text-ink">{episode.name}</span>
        {#if episode.description}
            <span class="line-clamp-2 max-w-[640px] text-[clamp(14px,0.9vw,16px)] leading-relaxed text-ink/60">{episode.description}</span>
        {/if}
    </span>
</button>
