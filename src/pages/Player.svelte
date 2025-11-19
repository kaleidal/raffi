<script lang="ts">
    import Slider from "../components/Slider.svelte";
    import ExpandingButton from "../components/ExpandingButton.svelte";
    import { slide } from "svelte/transition";
    import { onMount, tick } from "svelte";
    import Hls from "hls.js";
    import { createSession, getSessionUrl, getStreamUrl } from "../lib/client";

    let videoElem: HTMLVideoElement;
    let playerContainer: HTMLDivElement;

    let isPlaying = false;
    let currentTime = 0; // global time, seconds
    let duration = 0; // global duration, seconds
    let volume = 1;
    let controlsVisible = true;
    let hideTimeout: ReturnType<typeof setTimeout> | null = null;

    const IDLE_DELAY = 5000; // 5s

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

    // percent *elapsed* (for your styling)
    $: progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    const togglePlay = () => {
        if (!videoElem) return;
        if (videoElem.paused) {
            void videoElem.play();
        } else {
            videoElem.pause();
        }
        resetHideTimer();
    };

    // playbackOffset = where this slice starts in global timeline
    let playbackOffset = 0;
    let sessionId: string;
    let hls: Hls | null = null;

    // used to coordinate slider intent vs internal seeks
    let pendingSeek: number | null = null;
    let seekGuard = false;

    const handleTimeUpdate = () => {
        if (!videoElem) return;
        currentTime = playbackOffset + videoElem.currentTime;
    };

    const handlePlay = () => {
        isPlaying = true;
    };

    const handlePause = () => {
        isPlaying = false;
    };

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
        // Just update the UI/internal state while dragging
        const remaining = Number((event.target as HTMLInputElement).value);
        const desiredGlobal = Math.max(
            0,
            Math.min(duration, duration - remaining),
        );

        // We don't trigger the hard seek here, just update pendingSeek so the UI knows where we are
        pendingSeek = desiredGlobal;
    };

    const onSeekChange = (event: Event) => {
        if (!videoElem || duration <= 0) return;

        const remaining = Number((event.target as HTMLInputElement).value);
        const desiredGlobal = Math.max(
            0,
            Math.min(duration, duration - remaining),
        );

        pendingSeek = desiredGlobal;

        const localTarget = desiredGlobal - playbackOffset;

        if (isTimeBuffered(videoElem, localTarget)) {
            // already in current slice, just seek
            videoElem.currentTime = localTarget;
            // Clear pending seek since we handled it locally
            pendingSeek = null;
        } else {
            // trigger 'seeking' event so our handler will do the hard seek
            videoElem.currentTime = Math.max(localTarget, 0);
        }
    };

    const onVolumeChange = (event: Event) => {
        if (!videoElem) return;
        const v = Number((event.target as HTMLInputElement).value);
        volume = v;
        videoElem.volume = v;
    };

    const formatTime = (t: number) => {
        if (!isFinite(t) || t < 0) return "0:00";
        const minutes = Math.floor(t / 60);
        const seconds = Math.floor(t % 60)
            .toString()
            .padStart(2, "0");
        return `${minutes}:${seconds}`;
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
        }
    };

    onMount(async () => {
        const testTorrentioSrc =
            "https://torrentio.strem.fun/resolve/realdebrid/LMDSM5K2GLBR4BG6MT6JBPYHR7C5HZP2RAUCCNL4ZIS7236LV2LA/17c6cc17891f3640cef082cde56fd426b1dcd016/null/2/Just.Add.Magic.S01E03.Just.Add.Dogs.2160p.AMZN.WEB-DL.DDP5.1.x265-LAZY.mkv";

        // 1) create session + get base manifest URL
        sessionId = await createSession(testTorrentioSrc, "http");

        const baseManifest = `${getStreamUrl(sessionId)}/child.m3u8`;
        const sessionUrl = getSessionUrl(sessionId);

        // 2) fetch metadata (duration etc.)
        const sessionMetadata = await fetch(sessionUrl).then((res) =>
            res.json(),
        );
        duration = sessionMetadata.durationSeconds || 0;

        await tick();
        if (!videoElem) return;

        // 3) set up Hls.js or native HLS
        if (Hls.isSupported()) {
            hls = new Hls({
                lowLatencyMode: false,
                maxBufferLength: 30,
                backBufferLength: 30,
            });

            // initial manifest parsed -> autoplay
            const onInitialParsed = () => {
                console.log("HLS MANIFEST_PARSED (initial)");
                videoElem.play().catch((err) => {
                    console.warn("autoplay failed:", err);
                });
            };

            hls.on(Hls.Events.MANIFEST_PARSED, onInitialParsed);

            hls.on(Hls.Events.ERROR, (_, data) => {
                console.error("HLS ERROR", data);
                if (data.fatal) {
                    // if a fatal error happens mid-seek, release the guard
                    seekGuard = false;
                }
            });

            hls.loadSource(baseManifest);
            hls.attachMedia(videoElem);
        } else if (videoElem.canPlayType("application/vnd.apple.mpegurl")) {
            videoElem.src = baseManifest;
            videoElem.addEventListener("loadedmetadata", () => {
                videoElem.play().catch((err) => {
                    console.warn("autoplay failed:", err);
                });
            });
        } else {
            console.error("No HLS support");
        }

        // 4) hard-seek handler: when user asks for a time outside buffer,
        // reload HLS at ?seek=<globalTime>
        const onSeeking = () => {
            if (!videoElem) return;
            if (pendingSeek == null || seekGuard) return;

            const desiredGlobal = pendingSeek;
            pendingSeek = null;

            const localTarget = desiredGlobal - playbackOffset;

            // If the target is already buffered in current slice, just seek locally
            if (isTimeBuffered(videoElem, localTarget)) {
                videoElem.currentTime = localTarget;
                return;
            }

            // Otherwise we perform a hard seek -> new slice on the server
            seekGuard = true;
            const url = `${getStreamUrl(sessionId)}/child.m3u8?seek=${Math.floor(desiredGlobal)}`;
            console.log("Hard seek to", desiredGlobal, "->", url);

            if (hls) {
                // per-seek MANIFEST_PARSED handler
                const onSeekParsed = () => {
                    console.log("HLS MANIFEST_PARSED (seek)");
                    playbackOffset = desiredGlobal;
                    // we start from the beginning of the new slice
                    videoElem.currentTime = 0;
                    seekGuard = false;

                    videoElem.play().catch((err) => {
                        console.warn("play after seek failed:", err);
                    });

                    hls?.off(Hls.Events.MANIFEST_PARSED, onSeekParsed);
                };

                hls.on(Hls.Events.MANIFEST_PARSED, onSeekParsed);
                hls.loadSource(url);
                hls.startLoad(0);
            } else {
                // native HLS path (Safari etc.)
                videoElem.src = url;
                videoElem.onloadedmetadata = () => {
                    playbackOffset = desiredGlobal;
                    videoElem.currentTime = 0;
                    seekGuard = false;
                    videoElem
                        .play()
                        .catch((err) =>
                            console.warn("play after seek failed:", err),
                        );
                };
            }
        };

        videoElem.addEventListener("seeking", onSeeking);
    });
</script>

<svelte:window on:mousemove={handleMouseMove} on:keydown={handleKeydown} />

<div
    class="bg-black max-w-screen h-screen relative {!controlsVisible
        ? 'cursor-none'
        : ''}"
    bind:this={playerContainer}
>
    <div class="w-full h-screen">
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

    {#if controlsVisible}
        <div
            in:slide={{ duration: 200, axis: "y" }}
            out:slide={{ duration: 200, axis: "y" }}
            class="absolute left-1/2 -translate-x-1/2 z-10 items-center bg-[#000000]/10 backdrop-blur-[24px] rounded-[32px] w-[1000px] bottom-[40px] flex flex-col gap-2 px-[30px] py-[20px] text-white"
        >
            <div class="flex flex-row gap-[20px] items-center w-full">
                <button
                    on:click={togglePlay}
                    class="w-[60px] h-[60px] cursor-pointer hover:opacity-80 transition-opacity duration-200"
                >
                    {#if isPlaying}
                        <svg
                            width="60"
                            height="60"
                            viewBox="0 0 60 60"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path
                                d="M30 0C37.9565 0 45.5868 3.16102 51.2129 8.78711C56.839 14.4132 60 22.0435 60 30C60 37.9565 56.839 45.5868 51.2129 51.2129C45.5868 56.839 37.9565 60 30 60C22.0435 60 14.4132 56.839 8.78711 51.2129C3.16102 45.5868 0 37.9565 0 30C0 22.0435 3.16102 14.4132 8.78711 8.78711C14.4132 3.16102 22.0435 0 30 0ZM21.3574 17C20.0725 17 19.0002 18.0279 19 19.333V40.667C19.0002 41.9721 20.0725 43 21.3574 43H25.4287C26.7136 42.9999 27.786 41.9721 27.7861 40.667V19.333C27.786 18.0279 26.7136 17.0001 25.4287 17H21.3574ZM33.5713 17C32.2864 17.0001 31.214 18.0279 31.2139 19.333V40.667C31.214 41.9721 32.2864 42.9999 33.5713 43H37.6426C38.9275 43 39.9998 41.9721 40 40.667V19.333C39.9998 18.0279 38.9275 17 37.6426 17H33.5713Z"
                                fill="white"
                            />
                        </svg>
                    {:else}
                        <svg
                            width="60"
                            height="60"
                            viewBox="0 0 60 60"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path
                                d="M0 30C0 22.0435 3.16071 14.4129 8.7868 8.7868C14.4129 3.16071 22.0435 0 30 0C37.9565 0 45.5871 3.16071 51.2132 8.7868C56.8393 14.4129 60 22.0435 60 30C60 37.9565 56.8393 45.5871 51.2132 51.2132C45.5871 56.8393 37.9565 60 30 60C22.0435 60 14.4129 56.8393 8.7868 51.2132C3.16071 45.5871 0 37.9565 0 30ZM22.0664 17.2383C21.1758 17.7305 20.625 18.6797 20.625 19.6875V40.3125C20.625 41.332 21.1758 42.2695 22.0664 42.7617C22.957 43.2539 24.0352 43.2422 24.9141 42.7031L41.7891 32.3906C42.6211 31.875 43.1367 30.9727 43.1367 29.9883C43.1367 29.0039 42.6211 28.1016 41.7891 27.5859L24.9141 17.2734C24.0469 16.7461 22.957 16.7227 22.0664 17.2148V17.2383Z"
                                fill="white"
                            />
                        </svg>
                    {/if}
                </button>

                <span
                    class="text-[22px] font-poppins font-[500] text-[#D3D3D3] text-center"
                    >{formatTime(Math.max(0, duration - currentTime))}</span
                >

                <div class="relative flex-grow h-2">
                    <Slider
                        widthProgress={100 - progress}
                        widthGrey={progress}
                        onInput={onSeekInput}
                        onChange={onSeekChange}
                        value={duration - currentTime}
                        min={0}
                        max={duration}
                        step={0.1}
                    />
                </div>
            </div>

            <div class="flex items-center w-full justify-center gap-4">
                <ExpandingButton
                    label={"Fullscreen"}
                    onClick={() => {
                        toggleFullscreen();
                    }}
                >
                    <svg
                        width="22"
                        height="24"
                        viewBox="0 0 20 20"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            d="M6.66667 2.5H4.16667C3.72464 2.5 3.30072 2.67559 2.98816 2.98816C2.67559 3.30072 2.5 3.72464 2.5 4.16667V6.66667M17.5 6.66667V4.16667C17.5 3.72464 17.3244 3.30072 17.0118 2.98816C16.6993 2.67559 16.2754 2.5 15.8333 2.5H13.3333M2.5 13.3333V15.8333C2.5 16.2754 2.67559 16.6993 2.98816 17.0118C3.30072 17.3244 3.72464 17.5 4.16667 17.5H6.66667M13.3333 17.5H15.8333C16.2754 17.5 16.6993 17.3244 17.0118 17.0118C17.3244 16.6993 17.5 16.2754 17.5 15.8333V13.3333"
                            stroke="#E9E9E9"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        />
                    </svg>
                </ExpandingButton>

                <ExpandingButton label={"Settings"} onClick={() => {}}>
                    <svg
                        width="22"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            d="M12 20C14.1217 20 16.1566 19.1571 17.6569 17.6569C19.1571 16.1566 20 14.1217 20 12C20 9.87827 19.1571 7.84344 17.6569 6.34315C16.1566 4.84285 14.1217 4 12 4M12 20C9.87827 20 7.84344 19.1571 6.34315 17.6569C4.84285 16.1566 4 14.1217 4 12M12 20V22M12 4C9.87827 4 7.84344 4.84285 6.34315 6.34315C4.84285 7.84344 4 9.87827 4 12M12 4V2M4 12H2M14 12C14 12.5304 13.7893 13.0391 13.4142 13.4142C13.0391 13.7893 12.5304 14 12 14C11.4696 14 10.9609 13.7893 10.5858 13.4142C10.2107 13.0391 10 12.5304 10 12C10 11.4696 10.2107 10.9609 10.5858 10.5858C10.9609 10.2107 11.4696 10 12 10C12.5304 10 13.0391 10.2107 13.4142 10.5858C13.7893 10.9609 14 11.4696 14 12ZM14 12H22M17 20.66L16 18.93M11 10.27L7 3.34M20.66 17L18.93 16M3.34 7L5.07 8M20.66 7L18.93 8M3.34 17L5.07 16M17 3.34L16 5.07M11 13.73L7 20.66"
                            stroke="#E9E9E9"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        />
                    </svg>
                </ExpandingButton>

                <div class="w-[180px]">
                    <Slider
                        widthProgress={volume * 100}
                        widthGrey={100}
                        onInput={onVolumeChange}
                        value={volume}
                        label="Volume"
                        min={0}
                        max={1}
                        step={0.01}
                    />
                </div>
            </div>
        </div>
    {/if}
</div>
