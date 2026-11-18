<script lang="ts">
    import { createEventDispatcher, onDestroy, onMount } from "svelte";
    import { createAmbientGlow } from "./video/ambientGlow";
    import { resolveVideoFit } from "./video/videoFit";

    export let videoA: HTMLVideoElement | undefined = undefined;
    export let videoB: HTMLVideoElement | undefined = undefined;
    export let activeSurface: 0 | 1 = 0;
    export let canvasElem: HTMLCanvasElement | undefined = undefined;
    export let objectFit: "contain" | "cover";
    export let showCanvas: boolean;
    export let hidden: boolean = false;

    const dispatch = createEventDispatcher();

    $: videoElem = activeSurface === 0 ? videoA : videoB;

    const isActiveVideo = (target: EventTarget | null) =>
        Boolean(target) && target === (activeSurface === 0 ? videoA : videoB);

    const relay =
        (type: string) => (event: Event) => {
            if (!isActiveVideo(event.currentTarget)) return;
            dispatch(type, event);
        };

    let containerElem: HTMLDivElement | undefined = undefined;
    let ambientCanvasElem: HTMLCanvasElement | undefined = undefined;
    let ambientDisplayVisible = false;
    let effectiveObjectFit: "contain" | "cover" = "contain";
    let effectiveObjectPosition = "center center";
    let effectiveTransform = "none";

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
        isHidden: () => hidden,
        getObjectFit: () => objectFit,
        syncVideoFit: updateEffectiveVideoFit,
        onVisibilityChange: (visible) => (ambientDisplayVisible = visible),
    });

    $: ambientGlow.bindVideo(videoElem);
    $: ambientGlow.refresh();
    $: updateEffectiveVideoFit();

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
        class="absolute z-10 {activeSurface === 0 && !hidden
            ? `top-0 left-0 h-full w-full ${effectiveObjectFit === 'contain' ? 'object-contain' : 'object-cover'}`
            : 'left-[-9999px] top-0 h-px w-px opacity-0 pointer-events-none'}"
        style={activeSurface === 0 && !hidden
            ? `object-position: ${effectiveObjectPosition}; transform: ${effectiveTransform}; transform-origin: center center;`
            : undefined}
        playsinline
        preload="auto"
        muted={activeSurface !== 0}
        disablepictureinpicture
        aria-hidden={activeSurface !== 0 || hidden}
        on:timeupdate={relay("timeupdate")}
        on:progress={relay("progress")}
        on:play={relay("play")}
        on:pause={relay("pause")}
        on:ended={relay("ended")}
        on:click={relay("click")}
        on:waiting={relay("waiting")}
        on:playing={relay("playing")}
        on:canplay={relay("canplay")}
        on:error={relay("error")}
    >
        <track kind="captions" />
    </video>

    <video
        bind:this={videoB}
        class="absolute z-10 {activeSurface === 1 && !hidden
            ? `top-0 left-0 h-full w-full ${effectiveObjectFit === 'contain' ? 'object-contain' : 'object-cover'}`
            : 'left-[-9999px] top-0 h-px w-px opacity-0 pointer-events-none'}"
        style={activeSurface === 1 && !hidden
            ? `object-position: ${effectiveObjectPosition}; transform: ${effectiveTransform}; transform-origin: center center;`
            : undefined}
        playsinline
        preload="auto"
        muted={activeSurface !== 1}
        disablepictureinpicture
        aria-hidden={activeSurface !== 1 || hidden}
        on:timeupdate={relay("timeupdate")}
        on:progress={relay("progress")}
        on:play={relay("play")}
        on:pause={relay("pause")}
        on:ended={relay("ended")}
        on:click={relay("click")}
        on:waiting={relay("waiting")}
        on:playing={relay("playing")}
        on:canplay={relay("canplay")}
        on:error={relay("error")}
    >
        <track kind="captions" />
    </video>

    <canvas
        bind:this={canvasElem}
        class="absolute top-0 left-0 z-20 h-full w-full {effectiveObjectFit === 'contain'
            ? 'object-contain'
            : 'object-cover'} {showCanvas && !hidden ? 'block' : 'hidden'}"
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
