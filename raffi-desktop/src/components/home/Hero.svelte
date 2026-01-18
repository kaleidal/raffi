<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";
    import { Info, Play, Pause, VolumeX, Volume2 } from "lucide-svelte";
    import type { PopularTitleMeta } from "../../lib/library/types/popular_types";
    import { router } from "../../lib/stores/router";
    import ExpandingButton from "../common/ExpandingButton.svelte";

    export let showcasedTitle: PopularTitleMeta;

    const dispatch = createEventDispatcher();

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
    class="w-full relative overflow-hidden aspect-21/9"
    bind:this={container}
>
    <div
        class="absolute bottom-[100px] left-[100px] z-10 flex flex-col gap-[50px]"
    >
        <img
            src={showcasedTitle.logo ?? ""}
            alt="Logo"
            class="w-[600px] h-auto max-h-[220px] object-contain"
            on:error={() => dispatch("logoError")}
        />


        <div class="flex flex-row gap-[10px] items-center">
            <button
                class="bg-[#FFFFFF]/80 hover:bg-[#D3D3D3]/80 cursor-pointer backdrop-blur-2xl flex flex-row items-center justify-center gap-[20px] text-black text-[36px] font-poppins font-medium px-[100px] py-[20px] w-fit rounded-full transition-colors duration-200"
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

    <div
        class="absolute inset-0 w-full h-full scale-[1.35] pointer-events-none"
    >
        {#if trailerSrc}
            <iframe
                bind:this={playerIframe}
                frameborder="0"
                referrerpolicy="strict-origin-when-cross-origin"
                src={trailerSrc}
                class="w-full h-full object-cover"
                title="Trailer"
                on:load={handleTrailerLoad}
            ></iframe>
        {/if}
    </div>
    <div
        class="absolute inset-0 bg-gradient-to-t from-[#090909] via-transparent to-transparent"
    ></div>
    <div
        class="absolute inset-0 bg-gradient-to-r from-[#090909]/80 via-transparent to-transparent"
    ></div>
</div>
