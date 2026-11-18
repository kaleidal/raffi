<script lang="ts">
    import { fade, fly } from "svelte/transition";
    import { ChevronsRight, SkipForward } from "@lucide/svelte";

    let {
        skipLabel,
        onSkip,
        showNextEpisode,
        nextEpisodeHighlighted,
        onNextEpisode,
        showHealthPrompt = false,
        onChooseAnotherStream = () => {},
        onKeepWatching = () => {},
    }: {
        skipLabel: string | null;
        onSkip: () => void;
        showNextEpisode: boolean;
        nextEpisodeHighlighted: boolean;
        onNextEpisode: () => void;
        showHealthPrompt?: boolean;
        onChooseAnotherStream?: () => void;
        onKeepWatching?: () => void;
    } = $props();

    const pill =
        "flex cursor-pointer items-center gap-2 rounded-full px-[clamp(16px,1.3vw,24px)] py-[clamp(9px,0.7vw,13px)] text-[clamp(14px,0.95vw,17px)] font-semibold transition-[background-color,color,scale] duration-200 active:scale-95";
</script>

<div class="flex flex-col items-end gap-3">
    {#if showHealthPrompt}
        <div
            class="w-[min(440px,calc(100vw-32px))] rounded-[24px] bg-raised/85 p-5 text-ink shadow-[0_20px_70px_rgba(0,0,0,0.4)] backdrop-blur-2xl"
            in:fly={{ y: 16, duration: 220 }}
            out:fade={{ duration: 160 }}
        >
            <h2 class="text-lg font-semibold">Playback keeps buffering</h2>
            <p class="mt-1 text-sm text-ink/65">A smaller file or lower resolution may play smoother.</p>
            <div class="mt-4 flex gap-2">
                <button class="{pill} bg-accent text-on-accent hover:bg-accent/85" onclick={onChooseAnotherStream}>
                    Choose another source
                </button>
                <button class="{pill} bg-ink/10 text-ink hover:bg-ink/16" onclick={onKeepWatching}>Keep watching</button>
            </div>
        </div>
    {/if}

    {#if skipLabel || showNextEpisode}
        <div class="flex items-center gap-2.5">
            {#if skipLabel}
                <button class="{pill} bg-ink text-canvas hover:bg-ink/85" onclick={onSkip} transition:fade={{ duration: 160 }}>
                    <ChevronsRight size={20} strokeWidth={2.4} />
                    {skipLabel}
                </button>
            {/if}
            {#if showNextEpisode}
                <button
                    class="{pill} {nextEpisodeHighlighted
                        ? 'next-glow bg-accent text-on-accent'
                        : 'bg-ink/14 text-ink backdrop-blur-xl hover:bg-ink/22'}"
                    onclick={onNextEpisode}
                    transition:fade={{ duration: 160 }}
                >
                    <SkipForward size={18} strokeWidth={2.2} fill="currentColor" />
                    Next episode
                </button>
            {/if}
        </div>
    {/if}
</div>

<style>
    .next-glow {
        box-shadow: 0 0 32px color-mix(in oklab, var(--raffi-accent) 45%, transparent);
    }
</style>
