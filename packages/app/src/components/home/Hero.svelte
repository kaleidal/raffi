<script lang="ts">
    import { onMount } from "svelte";
    import { fade } from "svelte/transition";
    import { Info, Play, Pause, VolumeX, Volume2 } from "@lucide/svelte";
    import type { PopularTitleMeta } from "../../lib/library/types/popular_types";
    import { isAndroidPlatform } from "../../lib/shell/platform";
    import { router } from "../../lib/stores/router";
    import { followTrailerColours } from "../../lib/home/trailerAmbient";
    import IconButton from "../common/controls/IconButton.svelte";

    let {
        showcasedTitle,
        onLogoError,
    }: { showcasedTitle: PopularTitleMeta | null; onLogoError: () => void } = $props();

    let playerIframe = $state.raw<HTMLIFrameElement>();
    let container: HTMLDivElement;
    let isPaused = $state(false);
    let isMuted = $state(true);
    let wasPlayingBeforeHidden = false;
    let canControlTrailer = false;
    let trailerPlaying = false;
    let trailerFailed = $state(false);

    const trailerSrc = $derived(trailerUrl(showcasedTitle));

    $effect.pre(() => {
        if (!showcasedTitle) return;
        isMuted = true;
        isPaused = false;
        wasPlayingBeforeHidden = false;
        canControlTrailer = false;
        trailerPlaying = false;
        trailerFailed = false;
    });

    function trailerUrl(title: PopularTitleMeta | null) {
        const trailerId = isAndroidPlatform ? undefined : title?.trailerStreams?.at(-1)?.ytId;
        if (!trailerId) return "";
        const origin = window.location.origin;
        const originParam = origin && origin !== "null" ? `&origin=${encodeURIComponent(origin)}` : "";
        return `https://www.youtube-nocookie.com/embed/${trailerId}?controls=0&modestbranding=1&rel=0&autoplay=1&mute=1&loop=1&playlist=${trailerId}&showinfo=0&iv_load_policy=3&cc_load_policy=0&disablekb=1&enablejsapi=1${originParam}`;
    }

    onMount(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) {
                        if (!isPaused && canControlTrailer) {
                            wasPlayingBeforeHidden = true;
                            playerIframe?.contentWindow?.postMessage(
                                JSON.stringify({
                                    event: "command",
                                    func: "pauseVideo",
                                    args: [],
                                }),
                                "*",
                            );
                        }
                    } else {
                        if (wasPlayingBeforeHidden && canControlTrailer) {
                            playerIframe?.contentWindow?.postMessage(
                                JSON.stringify({
                                    event: "command",
                                    func: "playVideo",
                                    args: [],
                                }),
                                "*",
                            );
                            wasPlayingBeforeHidden = false;
                        }
                    }
                });
            },
            { threshold: 0.1 },
        );

        observer.observe(container);

        return () => observer.disconnect();
    });

    const sendTrailerCommand = (func: string, args: unknown[] = []) => {
        if (!playerIframe?.contentWindow) return;
        playerIframe.contentWindow.postMessage(
            JSON.stringify({ event: "command", func, args }),
            "*",
        );
    };

    const initTrailerBridge = () => {
        if (!playerIframe?.contentWindow) return;
        playerIframe.contentWindow.postMessage(
            JSON.stringify({ event: "listening", id: "hero-trailer" }),
            "*",
        );
        canControlTrailer = true;
        sendTrailerCommand("mute");
        isMuted = true;
    };

    const handleTrailerMessage = (event: MessageEvent) => {
        if (event.source !== playerIframe?.contentWindow) return;
        const payload =
            typeof event.data === "string"
                ? event.data.startsWith("{")
                    ? JSON.parse(event.data)
                    : null
                : event.data;
        if (!payload) return;
        if (payload?.event === "onReady") {
            initTrailerBridge();
        }
        if (payload?.event === "onError") trailerFailed = true;
        if (payload?.event === "onStateChange") {
            const state = payload?.info?.playerState;
            if (state === 1) {
                isPaused = false;
            } else if (state === 2) {
                isPaused = true;
            }
            if (state !== 3) trailerPlaying = state === 1;
        }
    };


    function togglePlay() {
        if (!playerIframe || !canControlTrailer) return;
        const command = isPaused ? "playVideo" : "pauseVideo";
        sendTrailerCommand(command);
        isPaused = !isPaused;
    }

    function toggleMute() {
        if (!playerIframe || !canControlTrailer) return;
        const command = isMuted ? "unMute" : "mute";
        sendTrailerCommand(command);
        isMuted = !isMuted;
    }


    function navigateToMeta(imdbId: string, type: string) {
        router.navigate("meta", { imdbId, type });
    }

    onMount(() => {
        window.addEventListener("message", handleTrailerMessage);
        const stopFollowing = followTrailerColours(() => (trailerSrc && !trailerFailed ? playerIframe : undefined), () => trailerPlaying);
        return () => {
            window.removeEventListener("message", handleTrailerMessage);
            stopFollowing();
        };
    });

    const handleTrailerLoad = () => {
        if (!canControlTrailer) {
            initTrailerBridge();
        }
    };

</script>

<div
    class="hero-shell scheme-dark w-full relative overflow-hidden isolate"
    bind:this={container}
>
    {#if showcasedTitle}
        <div
            in:fade={{ duration: 400 }}
            class="hero-content absolute left-[clamp(24px,5.2vw,100px)] z-10 flex max-w-[min(760px,72vw)] flex-col gap-[clamp(28px,3vw,50px)]"
        >
            {#if showcasedTitle.logo}
                <img
                    src={showcasedTitle.logo}
                    alt="Logo"
                    class="w-[clamp(300px,38vw,600px)] h-auto max-h-[clamp(130px,14vw,220px)] object-contain object-left"
                    onerror={onLogoError}
                />
            {:else}
                <h1 class="text-ink text-[clamp(40px,4vw,64px)] font-bold max-w-[700px] leading-[1.05]">
                    {showcasedTitle.name}
                </h1>
            {/if}


            <div class="flex flex-row gap-[10px] items-center">
                <button
                    data-tv-autofocus
                    class="details-button bg-accent/85 hover:bg-accent/70 cursor-pointer backdrop-blur-2xl flex flex-row items-center justify-center gap-[clamp(10px,1vw,16px)] text-on-accent text-[clamp(20px,1.8vw,32px)] font-medium px-[clamp(36px,4.4vw,84px)] py-[clamp(12px,1vw,18px)] w-fit rounded-full shadow-[0_10px_30px_rgba(0,0,0,0.18)] transition-colors duration-200"
                    onclick={() => navigateToMeta(showcasedTitle.imdb_id, showcasedTitle.type)}
                >
                    <Info size={48} strokeWidth={3} />

                    Details
                </button>

                {#if trailerSrc && !trailerFailed}
                    <IconButton
                        label={isPaused ? "Play" : "Pause"}
                        onClick={togglePlay}
                    >
                        {#if isPaused}
                            <Play size={24} strokeWidth={2} />
                        {:else}
                            <Pause size={24} strokeWidth={2} />
                        {/if}
                    </IconButton>

                    <IconButton
                        label={isMuted ? "Unmute" : "Mute"}
                        onClick={toggleMute}
                    >
                        {#if isMuted}
                            <VolumeX size={24} strokeWidth={2} />
                        {:else}
                            <Volume2 size={24} strokeWidth={2} />
                        {/if}
                    </IconButton>
                {/if}
            </div>
        </div>

        <div in:fade={{ duration: 400 }} class="hero-backdrop hero-media absolute inset-0 overflow-hidden pointer-events-none">
            {#if trailerSrc && !trailerFailed}
                <iframe
                    bind:this={playerIframe}
                    frameborder="0"
                    referrerpolicy="strict-origin-when-cross-origin"
                    src={trailerSrc}
                    class="hero-frame"
                    title="Trailer"
                    onload={handleTrailerLoad}
                ></iframe>
            {:else if showcasedTitle.background}
                <img src={showcasedTitle.background} alt="" class="hero-still" />
            {/if}
        </div>
    {/if}

    <div class="hero-backdrop pointer-events-none absolute inset-0 z-[1] bg-gradient-to-t from-canvas via-canvas/80 to-transparent"></div>
    <div class="hero-backdrop pointer-events-none absolute inset-0 z-[1] bg-gradient-to-r from-canvas/80 via-transparent to-transparent"></div>
</div>

<style>
    .hero-shell {
        --hero-content-gap: clamp(48px, 6vw, 100px);
        height: clamp(440px, min(58vw, 76dvh), 760px);
        min-height: 440px;
    }

    .hero-backdrop {
        mask-image: linear-gradient(
            to top,
            transparent,
            rgb(0 0 0 / 0.1) calc(var(--hero-content-gap) * 0.15),
            rgb(0 0 0 / 0.35) calc(var(--hero-content-gap) * 0.38),
            rgb(0 0 0 / 0.65) calc(var(--hero-content-gap) * 0.62),
            rgb(0 0 0 / 0.9) calc(var(--hero-content-gap) * 0.85),
            black var(--hero-content-gap)
        );
    }

    .hero-content {
        bottom: var(--hero-content-gap);
    }

    .hero-frame {
        position: absolute;
        left: 50%;
        top: 50%;
        width: max(100%, 177.778dvh);
        height: max(100%, 56.25vw);
        border: 0;
        transform: translate(-50%, -50%) scale(1.08);
    }

    .hero-still {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .details-button :global(svg) {
        width: clamp(26px, 2vw, 38px);
        height: clamp(26px, 2vw, 38px);
    }

    @media (orientation: portrait) {
        .hero-shell {
            height: clamp(560px, 74dvh, 780px);
            min-height: min(560px, 74dvh);
        }

        .hero-frame {
            width: max(100%, 177.778dvh);
            height: max(100%, 56.25vw);
            transform: translate(-50%, -50%) scale(1.04);
        }
    }
</style>
