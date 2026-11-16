<script lang="ts">
    import { Play, Star } from "@lucide/svelte";
    import { fade } from "svelte/transition";
    import ChannelLogo from "./ChannelLogo.svelte";
    import { guideProgrammes } from "../../../lib/live/library";
    import { nowAndNext, progressThrough } from "../../../lib/live/lineup";
    import type { LiveChannel } from "../../../lib/live/types";
    import { formatClock } from "../guide/timeline";

    let {
        channel,
        now,
        favourite,
        onPlay,
        onToggleFavourite,
    }: {
        channel: LiveChannel;
        now: number;
        favourite: boolean;
        onPlay: (channel: LiveChannel) => void;
        onToggleFavourite: (channel: LiveChannel) => void;
    } = $props();

    const airing = $derived(nowAndNext(channel.guideId ? $guideProgrammes.get(channel.guideId) : undefined, now));
    const label = $derived([channel.number, channel.group].filter(Boolean).join(" · "));
</script>

<section class="feature relative flex w-full shrink-0 items-center gap-[clamp(20px,2.4vw,44px)] overflow-hidden rounded-[clamp(24px,2.2vw,36px)] bg-ink/[0.04] p-[clamp(20px,2.2vw,36px)]">
    {#key channel.id}
        <div class="flex aspect-[3/2] h-full shrink-0 items-center justify-center overflow-hidden rounded-[clamp(18px,1.6vw,26px)] bg-ink/[0.06]" in:fade={{ duration: 250 }}>
            <ChannelLogo {channel} size="large" />
        </div>

        <div class="flex min-w-0 flex-1 flex-col gap-[clamp(6px,0.6vw,10px)]" in:fade={{ duration: 250 }}>
            {#if label}
                <p class="truncate text-sm text-ink/50 tabular-nums">{label}</p>
            {/if}
            <h2 class="truncate text-[clamp(24px,2vw,36px)] leading-tight font-semibold text-ink">{channel.name}</h2>

            {#if airing.now}
                <div class="flex min-w-0 items-center gap-4">
                    <p class="truncate font-medium text-ink/85">{airing.now.title}</p>
                    <span class="shrink-0 text-sm text-ink/50 tabular-nums">
                        {formatClock(airing.now.start)} – {formatClock(airing.now.stop)}
                    </span>
                </div>
                <div class="h-1 w-full max-w-[520px] overflow-hidden rounded-full bg-ink/12">
                    <div class="h-full origin-left rounded-full bg-accent" style="transform: scaleX({progressThrough(airing.now, now)})"></div>
                </div>
                {#if airing.now.description}
                    <p class="line-clamp-2 max-w-[760px] text-sm leading-relaxed text-ink/60">{airing.now.description}</p>
                {/if}
            {/if}
            {#if airing.next}
                <p class="truncate text-sm text-ink/45">
                    <span class="tabular-nums">{formatClock(airing.next.start)}</span>
                    {airing.next.title}
                </p>
            {/if}
        </div>
    {/key}

    <div class="flex shrink-0 items-center gap-2.5 self-end">
        <button
            class="cursor-pointer rounded-full p-3 transition-colors hover:bg-ink/10 {favourite ? 'text-accent' : 'text-ink/50 hover:text-ink'}"
            aria-label={favourite ? "Remove from favourites" : "Add to favourites"}
            aria-pressed={favourite}
            onclick={() => onToggleFavourite(channel)}
        >
            <Star size={22} strokeWidth={2} fill={favourite ? "currentColor" : "none"} />
        </button>
        <button
            class="flex cursor-pointer items-center gap-2.5 rounded-full bg-accent px-6 py-3 font-medium text-on-accent transition-colors hover:bg-accent/85"
            onclick={() => onPlay(channel)}
        >
            <Play size={20} strokeWidth={2.5} fill="currentColor" />
            Watch
        </button>
    </div>
</section>

<style>
    .feature {
        height: clamp(170px, 22vh, 250px);
    }
</style>
