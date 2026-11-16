<script module lang="ts">
    export type FeatureItem = {
        key: string;
        name: string;
        logo?: string;
        background?: string;
        description?: string;
        details?: string;
        trailerId?: string;
    };
</script>

<script lang="ts">
    import type { Snippet } from "svelte";
    import { Info, Pause, Play, Volume2, VolumeX } from "@lucide/svelte";
    import { fade } from "svelte/transition";
    import IconButton from "./controls/IconButton.svelte";

    let { item, onDetails, actions }: { item: FeatureItem; onDetails: () => void; actions?: Snippet } = $props();

    let player = $state<HTMLIFrameElement | null>(null);
    let paused = $state(false);
    let muted = $state(true);

    function command(func: string) {
        player?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args: [] }), "*");
    }

    function togglePlay() {
        paused = !paused;
        command(paused ? "pauseVideo" : "playVideo");
    }

    function toggleMute() {
        muted = !muted;
        command(muted ? "mute" : "unMute");
    }

    function syncPlayer() {
        command(muted ? "mute" : "unMute");
        command(paused ? "pauseVideo" : "playVideo");
    }
</script>

<section class="feature scheme-dark relative w-full shrink-0 overflow-hidden rounded-[clamp(24px,2.2vw,36px)] bg-canvas">
    {#key item.key}
        <div class="feature-media absolute inset-y-0 right-0 w-[72%] overflow-hidden" in:fade={{ duration: 400 }}>
            {#if item.trailerId}
                <iframe
                    bind:this={player}
                    frameborder="0"
                    referrerpolicy="strict-origin-when-cross-origin"
                    src={`https://www.youtube-nocookie.com/embed/${item.trailerId}?controls=0&modestbranding=1&rel=0&autoplay=1&mute=1&loop=1&playlist=${item.trailerId}&showinfo=0&iv_load_policy=3&cc_load_policy=0&disablekb=1&fs=0&playsinline=1&enablejsapi=1&origin=${window.location.origin}`}
                    class="feature-frame pointer-events-none"
                    title="Trailer"
                    onload={syncPlayer}
                ></iframe>
            {:else if item.background}
                <img src={item.background} alt="" class="h-full w-full object-cover" />
            {/if}
            <div class="absolute inset-0 bg-gradient-to-t from-canvas/70 via-transparent to-transparent"></div>
        </div>
    {/key}

    <div class="relative z-10 flex h-full max-w-[min(620px,58%)] flex-col justify-end gap-[clamp(10px,1vw,16px)] p-[clamp(24px,2.6vw,44px)]">
        {#if item.logo}
            <img src={item.logo} alt={item.name} class="max-h-[clamp(64px,6.5vw,112px)] max-w-[min(100%,360px)] self-start object-contain object-left" />
        {:else}
            <h2 class="text-[clamp(26px,2.2vw,40px)] leading-tight font-semibold text-ink">{item.name}</h2>
        {/if}

        {#if item.details}
            <p class="text-sm font-medium text-ink/70">{item.details}</p>
        {/if}

        {#if item.description}
            <p class="line-clamp-2 text-[clamp(14px,0.9vw,16px)] leading-relaxed text-ink/75">{item.description}</p>
        {/if}

        <div class="flex items-center gap-2.5 pt-1">
            <button
                class="flex cursor-pointer items-center gap-2.5 rounded-full bg-accent px-6 py-3 font-medium text-on-accent transition-colors hover:bg-accent/85"
                onclick={onDetails}
            >
                <Info size={20} strokeWidth={2.5} />
                Details
            </button>
            {#if item.trailerId}
                <IconButton label={paused ? "Play" : "Pause"} onClick={togglePlay}>
                    {#if paused}
                        <Play size={22} strokeWidth={2.2} />
                    {:else}
                        <Pause size={22} strokeWidth={2.2} />
                    {/if}
                </IconButton>
                <IconButton label={muted ? "Unmute" : "Mute"} onClick={toggleMute}>
                    {#if muted}
                        <VolumeX size={22} strokeWidth={2.2} />
                    {:else}
                        <Volume2 size={22} strokeWidth={2.2} />
                    {/if}
                </IconButton>
            {/if}
            {@render actions?.()}
        </div>
    </div>
</section>

<style>
    .feature {
        height: clamp(260px, 34vh, 420px);
    }

    .feature-media {
        container-type: size;
        mask-image: linear-gradient(to right, transparent, rgb(0 0 0 / 0.45) 22%, black 55%);
    }

    .feature-frame {
        position: absolute;
        left: 50%;
        top: 50%;
        width: max(100%, 177.78cqh);
        height: max(100%, 56.25cqw);
        border: 0;
        transform: translate(-50%, -50%) scale(1.08);
    }
</style>
