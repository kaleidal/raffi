<script lang="ts">
    import { onDestroy, onMount, untrack } from "svelte";
    import type { ContentRect } from "../../../lib/media/crop/barDetection";
    import { createAmbientGlow } from "./video/ambientGlow";
    import { videoBox, type VideoBox } from "./video/videoFit";

    type VideoEventHandler = () => void;

    let {
        videoA = $bindable(),
        videoB = $bindable(),
        activeSurface = 0,
        canvasElem = $bindable(),
        crop,
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
        /** The picture inside the video's frame, without the bars baked into it. */
        crop: ContentRect;
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
    const CROP_EASE_MS = 450;

    let box = $state.raw<VideoBox | null>(null);
    let easing = $state(false);

    const placeVideo = () => {
        box = videoBox(
            { width: containerElem?.clientWidth ?? 0, height: containerElem?.clientHeight ?? 0 },
            { width: videoElem?.videoWidth ?? 0, height: videoElem?.videoHeight ?? 0 },
            crop,
        );
    };

    const placement = $derived(
        box ? `left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px` : undefined,
    );

    const ambientGlow = createAmbientGlow({
        getContainer: () => containerElem,
        getCanvas: () => ambientCanvasElem,
        getVideo: () => videoElem,
        getCrop: () => crop,
        syncVideoFit: placeVideo,
        onVisibilityChange: (visible) => (ambientDisplayVisible = visible),
    });

    $effect.pre(() => {
        ambientGlow.bindVideo(videoElem);
    });
    $effect.pre(() => {
        crop;
        untrack(ambientGlow.refresh);
    });

    $effect(() => {
        if (crop.top === 0 && crop.left === 0) return;
        easing = true;
        const settled = setTimeout(() => (easing = false), CROP_EASE_MS);
        return () => clearTimeout(settled);
    });

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
            ? placement ? '' : 'top-0 left-0 h-full w-full object-contain'
            : 'left-[-9999px] top-0 h-px w-px opacity-0 pointer-events-none'}"
        class:crop-ease={easing}
        style={activeSurface === 0 ? placement : undefined}
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
            ? placement ? '' : 'top-0 left-0 h-full w-full object-contain'
            : 'left-[-9999px] top-0 h-px w-px opacity-0 pointer-events-none'}"
        class:crop-ease={easing}
        style={activeSurface === 1 ? placement : undefined}
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
        class="absolute z-20 {placement ? '' : 'top-0 left-0 h-full w-full object-contain'} {showCanvas ? 'block' : 'hidden'}"
        class:crop-ease={easing}
        style={placement}
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

    .crop-ease {
        transition-property: left, top, width, height;
        transition-duration: 450ms;
        transition-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
    }

    canvas[aria-hidden="true"] {
        filter: blur(72px) brightness(0.95);
    }
</style>
