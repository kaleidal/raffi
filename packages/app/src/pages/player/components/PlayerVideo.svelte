<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { createAmbientGlow } from "./video/ambientGlow";
    import { resolveVideoFit } from "./video/videoFit";

    type VideoEventHandler = () => void;

    let {
        videoA = $bindable(),
        videoB = $bindable(),
        activeSurface = 0,
        canvasElem = $bindable(),
        objectFit,
        showCanvas,
        onTimeUpdate,
        onProgress,
        onPlay,
        onPause,
        onEnded,
        onClick,
        onWaiting,
        onPlaying,
        onCanPlay,
        onError,
    }: {
        videoA?: HTMLVideoElement;
        videoB?: HTMLVideoElement;
        activeSurface?: 0 | 1;
        canvasElem?: HTMLCanvasElement;
        objectFit: "contain" | "cover";
        showCanvas: boolean;
        onTimeUpdate: VideoEventHandler;
        onProgress: VideoEventHandler;
        onPlay: VideoEventHandler;
        onPause: VideoEventHandler;
        onEnded: VideoEventHandler;
        onClick: VideoEventHandler;
        onWaiting: VideoEventHandler;
        onPlaying: VideoEventHandler;
        onCanPlay: VideoEventHandler;
        onError: VideoEventHandler;
    } = $props();

    const videoElem = $derived(activeSurface === 0 ? videoA : videoB);

    const relay = (handler: VideoEventHandler) => (event: Event) => {
        if (event.currentTarget === videoElem) handler();
    };

    let containerElem = $state<HTMLDivElement>();
    let ambientCanvasElem = $state<HTMLCanvasElement>();
    let ambientDisplayVisible = $state(false);
    let effectiveObjectFit = $state<"contain" | "cover">("contain");
    let effectiveObjectPosition = $state("center center");
    let effectiveTransform = $state("none");

    const updateEffectiveVideoFit = () => {
        const fit = resolveVideoFit(objectFit, containerElem, videoElem);
        effectiveObjectFit = fit.objectFit;
        effectiveObjectPosition = fit.objectPosition;
        effectiveTransform = fit.transform;
    };

    const ambientGlow = createAmbientGlow({
        getContainer: () => containerElem,
        getCanvas: () => ambientCanvasElem,
        getVideo: () => videoElem,
        getObjectFit: () => objectFit,
        syncVideoFit: updateEffectiveVideoFit,
        onVisibilityChange: (visible) => (ambientDisplayVisible = visible),
    });

    $effect.pre(() => {
        ambientGlow.bindVideo(videoElem);
    });
    $effect.pre(updateEffectiveVideoFit);

    onMount(ambientGlow.mount);
    onDestroy(ambientGlow.destroy);
</script>

<div bind:this={containerElem} class="relative w-full h-full bg-black overflow-hidden">
    <canvas
        bind:this={ambientCanvasElem}
        class="pointer-events-none absolute inset-[-8%] z-0 h-[116%] w-[116%] origin-center scale-[1.12] saturate-[1.55] {ambientDisplayVisible ? 'opacity-100' : 'opacity-0'}"
        aria-hidden="true"
    ></canvas>

    <video
        bind:this={videoA}
        class="absolute z-10 {activeSurface === 0
            ? `top-0 left-0 h-full w-full ${effectiveObjectFit === 'contain' ? 'object-contain' : 'object-cover'}`
            : 'left-[-9999px] top-0 h-px w-px opacity-0 pointer-events-none'}"
        style={activeSurface === 0
            ? `object-position: ${effectiveObjectPosition}; transform: ${effectiveTransform}; transform-origin: center center;`
            : undefined}
        playsinline
        preload="auto"
        muted={activeSurface !== 0}
        disablepictureinpicture
        aria-hidden={activeSurface !== 0}
        ontimeupdate={relay(onTimeUpdate)}
        onprogress={relay(onProgress)}
        onplay={relay(onPlay)}
        onpause={relay(onPause)}
        onended={relay(onEnded)}
        onclick={relay(onClick)}
        onwaiting={relay(onWaiting)}
        onplaying={relay(onPlaying)}
        oncanplay={relay(onCanPlay)}
        onerror={relay(onError)}
    >
        <track kind="captions" />
    </video>

    <video
        bind:this={videoB}
        class="absolute z-10 {activeSurface === 1
            ? `top-0 left-0 h-full w-full ${effectiveObjectFit === 'contain' ? 'object-contain' : 'object-cover'}`
            : 'left-[-9999px] top-0 h-px w-px opacity-0 pointer-events-none'}"
        style={activeSurface === 1
            ? `object-position: ${effectiveObjectPosition}; transform: ${effectiveTransform}; transform-origin: center center;`
            : undefined}
        playsinline
        preload="auto"
        muted={activeSurface !== 1}
        disablepictureinpicture
        aria-hidden={activeSurface !== 1}
        ontimeupdate={relay(onTimeUpdate)}
        onprogress={relay(onProgress)}
        onplay={relay(onPlay)}
        onpause={relay(onPause)}
        onended={relay(onEnded)}
        onclick={relay(onClick)}
        onwaiting={relay(onWaiting)}
        onplaying={relay(onPlaying)}
        oncanplay={relay(onCanPlay)}
        onerror={relay(onError)}
    >
        <track kind="captions" />
    </video>

    <canvas
        bind:this={canvasElem}
        class="absolute top-0 left-0 z-20 h-full w-full {effectiveObjectFit === 'contain'
            ? 'object-contain'
            : 'object-cover'} {showCanvas ? 'block' : 'hidden'}"
        style={`object-position: ${effectiveObjectPosition}; transform: ${effectiveTransform}; transform-origin: center center;`}
    ></canvas>
</div>

<style>
    /* Hide default controls */
    video::-webkit-media-controls {
        display: none !important;
    }
    video::-webkit-media-controls-enclosure {
        display: none !important;
    }

    /* Subtitle styling */
    video::cue {
        background-color: transparent !important;
        text-shadow: 0 0 4px black;
        font-family: inherit;
    }

    canvas[aria-hidden="true"] {
        filter: blur(72px) brightness(0.95);
    }
</style>
