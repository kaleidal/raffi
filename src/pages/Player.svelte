<script lang="ts">
    import { onDestroy, onMount, tick } from "svelte";
    import Hls from "hls.js";
    import {
        createSession,
        getSessionUrl,
        getStreamUrl,
        serverUrl,
    } from "../lib/client";
    import type { ShowResponse } from "../lib/library/types/meta_types";
    import PlayerControls from "../components/player/PlayerControls.svelte";
    import PlayerOverlays from "../components/player/PlayerOverlays.svelte";

    export let videoSrc: string | null = null;
    export let metaData: ShowResponse | null = null;
    export let autoPlay: boolean = true;
    export let onClose: () => void = () => {};
    export let onNextEpisode: () => void = () => {};

    export let onProgress: (time: number, duration: number) => void = () => {};
    export let startTime: number = 0;

    interface Chapter {
        startTime: number;
        endTime: number;
        title: string;
    }

    let videoElem: HTMLVideoElement;
    let playerContainer: HTMLDivElement;
    let canvasElem: HTMLCanvasElement;

    let isPlaying = false;
    let loading = true;
    let showCanvas = false;
    let sessionData: any = null;
    let currentChapter: Chapter | null = null;
    let showSkipIntro = false;
    let showNextEpisode = false;
    let currentTime = 0;
    let duration = 0;
    let volume = 1;
    let controlsVisible = true;
    let hideTimeout: ReturnType<typeof setTimeout> | null = null;

    const IDLE_DELAY = 5000;

    function resetHideTimer() {
        controlsVisible = true;
        if (hideTimeout) clearTimeout(hideTimeout);
        hideTimeout = setTimeout(() => {
            controlsVisible = false;
        }, IDLE_DELAY);
    }

    function handleMouseMove() {
        resetHideTimer();
    }

    const togglePlay = () => {
        if (!videoElem) return;
        if (videoElem.paused) {
            void videoElem.play();
        } else {
            videoElem.pause();
        }
        resetHideTimer();
    };

    let playbackOffset = 0;
    let sessionId: string;
    let hls: Hls | null = null;
    let pendingSeek: number | null = null;
    let seekGuard = false;
    let firstSeekLoad = false;

    const handleTimeUpdate = () => {
        if (!videoElem) return;
        currentTime = playbackOffset + videoElem.currentTime;
        onProgress(currentTime, duration);
        if (!seekGuard) {
            checkChapters(currentTime);
        }
    };

    const handlePlay = () => {
        isPlaying = true;
    };

    const handlePause = () => {
        isPlaying = false;
    };

    function checkChapters(time: number) {
        let inIntro = false;
        let inCredits = false;

        if (sessionData && sessionData.chapters) {
            const chapter = sessionData.chapters.find(
                (c: any) => time >= c.startTime && time < c.endTime,
            );

            if (chapter) {
                currentChapter = chapter;
                const title = chapter.title.toLowerCase();

                if (
                    title.includes("intro") ||
                    title.includes("opening") ||
                    title.includes("logo")
                ) {
                    inIntro = true;
                }

                if (title.includes("credits") || title.includes("ending")) {
                    inCredits = true;
                }
            } else {
                currentChapter = null;
            }
        }

        showSkipIntro = inIntro;

        if (inCredits && metaData?.meta.type === "series") {
            showNextEpisode = true;
        } else if (
            duration > 0 &&
            duration - time <= 45 &&
            metaData?.meta.type === "series"
        ) {
            showNextEpisode = true;
        } else {
            showNextEpisode = false;
        }
    }

    function skipChapter() {
        if (currentChapter) {
            performSeek(currentChapter.endTime + 0.1);
        }
    }

    function nextEpisode() {
        onNextEpisode();
    }

    function handleNextEpisodeClick() {
        if (duration > 0 && duration - currentTime <= 600) {
            onProgress(duration, duration);
        }
        onNextEpisode();
    }

    function isTimeBuffered(
        elem: HTMLVideoElement,
        target: number,
        tolerance = 0.5,
    ): boolean {
        const b = elem.buffered;
        if (!b || b.length === 0) return false;
        for (let i = 0; i < b.length; i++) {
            const start = b.start(i);
            const end = b.end(i);
            if (target >= start - tolerance && target <= end + tolerance) {
                return true;
            }
        }
        return false;
    }

    const onSeekInput = (event: Event) => {
        const remaining = Number((event.target as HTMLInputElement).value);
        const desiredGlobal = Math.max(
            0,
            Math.min(duration, duration - remaining),
        );

        pendingSeek = desiredGlobal;
    };

    const performSeek = (targetGlobal: number) => {
        if (!videoElem || duration <= 0) return;

        targetGlobal = Math.max(0, Math.min(duration, targetGlobal));

        pendingSeek = targetGlobal;
        const localTarget = targetGlobal - playbackOffset;

        if (isTimeBuffered(videoElem, localTarget)) {
            videoElem.currentTime = localTarget;
            pendingSeek = null;
        } else {
            captureFrame();
            showCanvas = true;
            videoElem.currentTime = Math.max(localTarget, 0);
        }
    };

    const onSeekChange = (event: Event) => {
        const remaining = Number((event.target as HTMLInputElement).value);
        const desiredGlobal = duration - remaining;
        performSeek(desiredGlobal);
    };

    const onVolumeChange = (event: Event) => {
        if (!videoElem) return;
        const v = Number((event.target as HTMLInputElement).value);
        volume = v;
        videoElem.volume = v;
    };

    const toggleFullscreen = async () => {
        if (!document.fullscreenElement) {
            await playerContainer?.requestFullscreen?.();
        } else {
            await document.exitFullscreen();
        }
    };

    const handleKeydown = (event: KeyboardEvent) => {
        if (event.code === "Space") {
            event.preventDefault();
            togglePlay();
        } else if (event.code === "ArrowLeft") {
            // Forward 5s (inverted)
            performSeek(currentTime + 5);
        } else if (event.code === "ArrowRight") {
            // Backward 5s (inverted)
            performSeek(currentTime - 5);
        } else if (event.code === "ArrowUp") {
            volume = Math.min(1, volume + 0.1);
            videoElem.volume = volume;
        } else if (event.code === "ArrowDown") {
            volume = Math.max(0, volume - 0.1);
            videoElem.volume = volume;
        } else if (event.code === "Escape") {
            toggleFullscreen();
        } else if (event.code === "KeyF") {
            toggleFullscreen();
        }
    };

    let currentVideoSrc: string | null = null;

    const cleanupSession = () => {
        if (hls) {
            hls.destroy();
            hls = null;
        }

        if (sessionId) {
            const url = `${serverUrl}/cleanup?id=${sessionId}`;
            if (navigator.sendBeacon) {
                navigator.sendBeacon(url);
            } else {
                fetch(url, { method: "POST", keepalive: true });
            }
            sessionId = "";
        }
    };

    const loadVideo = async (src: string) => {
        try {
            loading = true;
            showCanvas = false;
            isPlaying = false;

            currentTime = 0;
            duration = 0;
            playbackOffset = 0;
            currentChapter = null;
            showSkipIntro = false;
            showNextEpisode = false;
            seekGuard = false;
            firstSeekLoad = false;
            pendingSeek = null;

            sessionId = await createSession(src, "http", startTime);
            playbackOffset = startTime;

            let baseManifest = `${getStreamUrl(sessionId)}/child.m3u8`;

            const res = await fetch(`${serverUrl}/sessions/${sessionId}`);
            if (!res.ok) throw new Error("Failed to load session info");
            sessionData = await res.json();
            if (sessionData.chapters) {
                console.log("Loaded chapters:", sessionData.chapters);
            }
            duration = sessionData.durationSeconds || 0;

            await tick();
            if (!videoElem) return;

            if (Hls.isSupported()) {
                hls = new Hls({
                    lowLatencyMode: false,
                    maxBufferLength: 30,
                    backBufferLength: 30,
                    xhrSetup: (xhr, url) => {
                        if (url.includes("seek=") && !firstSeekLoad) {
                            const cleanUrl = url.split("?")[0];
                            xhr.open("GET", cleanUrl, true);
                        } else if (url.includes("seek=")) {
                            firstSeekLoad = false;
                        }
                    },
                });

                const onInitialParsed = () => {
                    hls?.off(Hls.Events.MANIFEST_PARSED, onInitialParsed);
                    console.log("HLS MANIFEST_PARSED (initial)");
                    loading = false;
                    showCanvas = false;
                    if (autoPlay) {
                        videoElem.play().catch((err) => {
                            console.warn("autoplay failed:", err);
                        });
                    }
                };

                hls.on(Hls.Events.MANIFEST_LOADED, (_, data) => {
                    console.log("MANIFEST_LOADED data:", data);
                    if (
                        data.networkDetails &&
                        data.networkDetails instanceof XMLHttpRequest
                    ) {
                        console.log("Network details is XHR");
                        const startHeader =
                            data.networkDetails.getResponseHeader(
                                "X-Raffi-Slice-Start",
                            );
                        if (startHeader) {
                            const val = parseFloat(startHeader);
                            if (!isNaN(val)) {
                                console.log(
                                    "Received slice start offset:",
                                    val,
                                );
                                playbackOffset = val;
                            } else {
                                console.warn(
                                    "Invalid slice start header:",
                                    startHeader,
                                );
                            }
                        } else {
                            console.warn("No X-Raffi-Slice-Start header found");
                        }
                    }
                });

                hls.on(Hls.Events.MANIFEST_PARSED, onInitialParsed);

                hls.on(Hls.Events.ERROR, (_, data) => {
                    console.error("HLS ERROR", data);
                    if (data.fatal) {
                        seekGuard = false;
                    }
                });

                hls.loadSource(baseManifest);
                hls.attachMedia(videoElem);
            } else if (videoElem.canPlayType("application/vnd.apple.mpegurl")) {
                videoElem.src = baseManifest;
                videoElem.addEventListener("loadedmetadata", () => {
                    if (autoPlay) {
                        videoElem.play().catch((err) => {
                            console.warn("autoplay failed:", err);
                        });
                    }
                });
            } else {
                console.error("No HLS support");
            }

            const onSeeking = () => {
                if (!videoElem) return;
                if (pendingSeek == null || seekGuard) return;

                const desiredGlobal = pendingSeek;
                pendingSeek = null;

                const localTarget = desiredGlobal - playbackOffset;

                if (isTimeBuffered(videoElem, localTarget)) {
                    videoElem.currentTime = localTarget;
                    return;
                }

                seekGuard = true;
                loading = true;
                showCanvas = true;
                firstSeekLoad = true;
                const seekId = Math.random().toString(36).substring(7);
                const url = `${getStreamUrl(sessionId)}/child.m3u8?seek=${Math.floor(desiredGlobal)}&seek_id=${seekId}`;
                console.log("Hard seek to", desiredGlobal, "->", url);

                if (hls) {
                    const onSeekParsed = () => {
                        console.log("HLS MANIFEST_PARSED (seek)");
                        playbackOffset = desiredGlobal;
                        seekGuard = false;
                        loading = false;
                        showCanvas = false;

                        videoElem.play().catch((err) => {
                            console.warn("play after seek failed:", err);
                        });

                        hls?.off(Hls.Events.MANIFEST_PARSED, onSeekParsed);
                    };

                    hls.on(Hls.Events.MANIFEST_PARSED, onSeekParsed);
                    hls.loadSource(url);
                    hls.startLoad(0);
                } else {
                    videoElem.src = url;
                    videoElem.onloadedmetadata = () => {
                        playbackOffset = desiredGlobal;
                        videoElem.currentTime = 0;
                        seekGuard = false;
                        loading = false;
                        showCanvas = false;
                        videoElem
                            .play()
                            .catch((err) =>
                                console.warn("play after seek failed:", err),
                            );
                    };
                }
            };

            videoElem.addEventListener("seeking", onSeeking);
        } catch (err) {
            console.error("Error loading video:", err);
            loading = false;
        }
    };

    $: if (videoSrc && videoSrc !== currentVideoSrc) {
        console.log("videoSrc changed, reloading...", videoSrc);
        currentVideoSrc = videoSrc;
        cleanupSession();
        loadVideo(videoSrc);
    }

    onDestroy(() => {
        cleanupSession();
    });

    const captureFrame = () => {
        if (!videoElem || !canvasElem) return;
        canvasElem.width = videoElem.videoWidth;
        canvasElem.height = videoElem.videoHeight;
        const ctx = canvasElem.getContext("2d");
        if (ctx) {
            ctx.drawImage(videoElem, 0, 0, canvasElem.width, canvasElem.height);
        }
    };
</script>

<svelte:window on:mousemove={handleMouseMove} on:keydown={handleKeydown} />

<div
    class="fixed inset-0 w-screen h-screen bg-black overflow-hidden group {controlsVisible
        ? 'cursor-default'
        : 'cursor-none'}"
    bind:this={playerContainer}
>
    <div class="w-full h-screen">
        <canvas
            bind:this={canvasElem}
            class="absolute inset-0 w-full h-full object-contain z-10 {showCanvas
                ? 'block'
                : 'hidden'}"
        ></canvas>
        <video
            bind:this={videoElem}
            on:timeupdate={handleTimeUpdate}
            on:play={handlePlay}
            on:pause={handlePause}
            on:click={togglePlay}
            class="absolute inset-0 z-0 w-full h-full object-contain"
        >
            <track kind="captions" />
        </video>
    </div>

    {#if controlsVisible && !loading}
        <div class="absolute left-0 top-0 p-10 z-50">
            <button
                class="bg-[#000000]/20 backdrop-blur-md hover:bg-[#FFFFFF]/20 transition-colors duration-200 rounded-full p-4 cursor-pointer"
                on:click={onClose}
                aria-label="Close player"
            >
                <svg
                    width="30"
                    height="30"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path
                        d="M15 19L8 12L15 5"
                        stroke="white"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    />
                </svg>
            </button>
        </div>

        <div
            class="absolute left-1/2 -translate-x-1/2 bottom-[50px] z-50 flex flex-col gap-[10px]"
        >
            <PlayerOverlays
                {showSkipIntro}
                {showNextEpisode}
                {skipChapter}
                {nextEpisode}
            />
            <PlayerControls
                {isPlaying}
                {duration}
                {currentTime}
                {volume}
                {controlsVisible}
                {loading}
                {videoSrc}
                {togglePlay}
                {onSeekInput}
                {onSeekChange}
                {onVolumeChange}
                {toggleFullscreen}
                onNextEpisode={handleNextEpisodeClick}
            />
        </div>
    {/if}

    {#if loading}
        <div
            class="fixed inset-0 z-50 bg-[#000000]/10 backdrop-blur-[12px] flex items-center justify-center"
        >
            {#if metaData}
                <div class="relative z-10 flex flex-col items-center gap-8">
                    <img
                        src={metaData.meta.logo ?? ""}
                        alt="Logo"
                        class="w-[400px] object-contain animate-pulse"
                    />
                </div>
            {/if}
        </div>
    {/if}
</div>
