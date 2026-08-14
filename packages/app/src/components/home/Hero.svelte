<script lang="ts">
    import { onMount } from "svelte";
    import { Info, Play, Pause, VolumeX, Volume2 } from "@lucide/svelte";
    import type { PopularTitleMeta } from "../../lib/library/types/popular_types";
    import { router } from "../../lib/stores/router";
    import ExpandingButton from "../common/ExpandingButton.svelte";

    export let showcasedTitle: PopularTitleMeta;

    export let onLogoError: () => void = () => {};

    let playerIframe: HTMLIFrameElement;
    let container: HTMLDivElement;
    let isPaused = false;
    let isMuted = true;
    let wasPlayingBeforeHidden = false;
    let canControlTrailer = false;
    let trailerSrc = "";


    $: if (showcasedTitle) {
        isMuted = true;
        isPaused = false;
        wasPlayingBeforeHidden = false;
        canControlTrailer = false;
        const trailerId = showcasedTitle.trailerStreams?.at(-1)?.ytId;
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const originParam = origin && origin !== "null" ? `&origin=${encodeURIComponent(origin)}` : "";
        trailerSrc = trailerId
            ? `https://www.youtube-nocookie.com/embed/${trailerId}?controls=0&modestbranding=1&rel=0&autoplay=1&mute=1&loop=1&playlist=${trailerId}&showinfo=0&iv_load_policy=3&disablekb=1&enablejsapi=1${originParam}`
            : "";
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

        if (container) observer.observe(container);

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
        if (payload?.event === "onStateChange") {
            const state = payload?.info?.playerState;
            if (state === 1) {
                isPaused = false;
            } else if (state === 2) {
                isPaused = true;
            }
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
        return () => window.removeEventListener("message", handleTrailerMessage);
    });

    const handleTrailerLoad = () => {
        if (!canControlTrailer) {
            initTrailerBridge();
        }
    };

</script>

<div
    class="hero-shell w-full relative overflow-hidden bg-[#090909] isolate"
    bind:this={container}
>
    <div
        class="absolute bottom-[clamp(48px,6vw,100px)] left-[clamp(24px,5.2vw,100px)] z-10 flex max-w-[min(760px,72vw)] flex-col gap-[clamp(28px,3vw,50px)]"
    >
        {#if showcasedTitle.logo}
            <img
                src={showcasedTitle.logo}
                alt="Logo"
                class="w-[clamp(300px,38vw,600px)] h-auto max-h-[clamp(130px,14vw,220px)] object-contain object-left"
                on:error={onLogoError}
            />
        {:else}
            <h1 class="text-white text-[clamp(40px,4vw,64px)] font-poppins font-bold max-w-[700px] leading-[1.05]">
                {showcasedTitle.name}
            </h1>
        {/if}


        <div class="flex flex-row gap-[10px] items-center">
            <button
                class="details-button bg-[#FFFFFF]/80 hover:bg-[#D3D3D3]/80 cursor-pointer backdrop-blur-2xl flex flex-row items-center justify-center gap-[clamp(10px,1vw,16px)] text-black text-[clamp(20px,1.8vw,32px)] font-poppins font-medium px-[clamp(36px,4.4vw,84px)] py-[clamp(12px,1vw,18px)] w-fit rounded-full transition-colors duration-200"
                on:click={() =>
                    navigateToMeta(showcasedTitle.imdb_id, showcasedTitle.type)}
            >
                <Info size={48} strokeWidth={3} color="black" />

                Details
            </button>

            <ExpandingButton
                label={isPaused ? "Play" : "Pause"}
                onClick={togglePlay}
            >
                {#if isPaused}
                    <Play size={24} strokeWidth={2} color="#E9E9E9" />
                {:else}
                    <Pause size={24} strokeWidth={2} color="#E9E9E9" />
                {/if}
            </ExpandingButton>

            <ExpandingButton
                label={isMuted ? "Unmute" : "Mute"}
                onClick={toggleMute}
            >
                {#if isMuted}
                    <VolumeX size={24} strokeWidth={2} color="#E9E9E9" />
                {:else}
                    <Volume2 size={24} strokeWidth={2} color="#E9E9E9" />
                {/if}
            </ExpandingButton>
        </div>
    </div>

    <div class="hero-media absolute inset-0 overflow-hidden pointer-events-none">
        {#if trailerSrc}
            <iframe
                bind:this={playerIframe}
                frameborder="0"
                referrerpolicy="strict-origin-when-cross-origin"
                src={trailerSrc}
                class="hero-frame"
                title="Trailer"
                on:load={handleTrailerLoad}
            ></iframe>
        {/if}
    </div>
    <div
        class="absolute inset-0 z-[1] bg-gradient-to-t from-[#090909] via-[#090909]/80 to-transparent"
    ></div>
    <div
        class="absolute inset-0 z-[1] bg-gradient-to-r from-[#090909]/80 via-transparent to-transparent"
    ></div>
    <div class="absolute bottom-0 left-0 right-0 h-[14px] z-[2] bg-[#090909]"></div>
</div>

<style>
    .hero-shell {
        height: clamp(440px, min(58vw, 76dvh), 760px);
        min-height: 440px;
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
