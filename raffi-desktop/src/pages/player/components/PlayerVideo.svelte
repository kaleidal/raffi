<script lang="ts">
    import { onDestroy, onMount } from "svelte";

    export let videoElem: HTMLVideoElement | undefined = undefined;
    export let canvasElem: HTMLCanvasElement | undefined = undefined;
    export let objectFit: "contain" | "cover";
    export let showCanvas: boolean;
    export let hidden: boolean = false;

    const AMBIENT_ASPECT_EPSILON = 0.015;
    const SMART_COVER_MAX_CROP_RATIO = 0.02;
    const MANUAL_ZOOM_SCALE = 1.035;
    const AMBIENT_MIN_WIDTH = 160;
    const AMBIENT_MAX_WIDTH = 420;
    const AMBIENT_BLEND_FACTOR = 0.14;
    const AMBIENT_SAMPLE_GRID = 4;
    const AMBIENT_FRAME_INTERVAL_MS = 1000 / 30;

    let containerElem: HTMLDivElement | undefined = undefined;
    let ambientCanvasElem: HTMLCanvasElement | undefined = undefined;
    let resizeObserver: ResizeObserver | undefined = undefined;
    let ambientActive = false;
    let ambientLoopRunning = false;
    let ambientRaf = 0;
    let lastAmbientWidth = 0;
    let lastAmbientHeight = 0;
    let lastAmbientDrawAt = 0;
    let detachVideoListeners = () => {};
    let ambientBlendCanvas: HTMLCanvasElement | undefined = undefined;
    let ambientSourceCanvas: HTMLCanvasElement | undefined = undefined;
    let ambientSampleCanvas: HTMLCanvasElement | undefined = undefined;
    let ambientHasFrame = false;
    let ambientDisplayVisible = false;
    let effectiveObjectFit: "contain" | "cover" = "contain";
    let effectiveObjectPosition = "center center";
    let effectiveTransform = "none";

    const getAmbientContext = () => ambientCanvasElem?.getContext("2d", { alpha: false }) ?? null;
    const getCanvasContext = (canvas: HTMLCanvasElement | undefined) => canvas?.getContext("2d", { alpha: false }) ?? null;
    const getSampleContext = () => ambientSampleCanvas?.getContext("2d", {
        alpha: false,
        willReadFrequently: true,
    }) ?? null;

    const syncCanvasSize = (canvas: HTMLCanvasElement | undefined, width: number, height: number) => {
        if (!canvas) return;
        if (canvas.width === width && canvas.height === height) return;
        canvas.width = width;
        canvas.height = height;
    };

    const resetAmbientFrameState = () => {
        ambientHasFrame = false;
    };

    const getSmartCoverCropRatio = () => {
        if (!containerElem || !videoElem) return 1;

        const containerWidth = containerElem.clientWidth;
        const containerHeight = containerElem.clientHeight;
        const { videoWidth, videoHeight } = videoElem;

        if (!containerWidth || !containerHeight || !videoWidth || !videoHeight) {
            return 1;
        }

        const videoAspect = videoWidth / videoHeight;
        const containerAspect = containerWidth / containerHeight;

        if (!Number.isFinite(videoAspect) || !Number.isFinite(containerAspect)) {
            return 1;
        }

        if (videoAspect > containerAspect) {
            return 1 - containerAspect / videoAspect;
        }

        return 1 - videoAspect / containerAspect;
    };

    const updateEffectiveVideoFit = () => {
        if (objectFit === "cover") {
            effectiveObjectFit = "cover";
            effectiveObjectPosition = "center center";
            effectiveTransform = `scale(${MANUAL_ZOOM_SCALE})`;
            return;
        }

        const cropRatio = getSmartCoverCropRatio();
        const useSmartCover = cropRatio > 0 && cropRatio <= SMART_COVER_MAX_CROP_RATIO;

        effectiveObjectFit = useSmartCover ? "cover" : "contain";
        effectiveObjectPosition = "center center";
        effectiveTransform = "none";
    };

    const updateAmbientDisplayVisibility = () => {
        ambientDisplayVisible = !hidden && objectFit === "contain" && (ambientActive || ambientHasFrame);
    };

    const getAverageFrameColor = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
        const sampleSize = AMBIENT_SAMPLE_GRID;

        if (ctx.canvas.width !== sampleSize || ctx.canvas.height !== sampleSize) {
            ctx.canvas.width = sampleSize;
            ctx.canvas.height = sampleSize;
        }

        ctx.clearRect(0, 0, sampleSize, sampleSize);
        ctx.drawImage(canvas, 0, 0, sampleSize, sampleSize);

        const pixels = ctx.getImageData(0, 0, sampleSize, sampleSize).data;
        let red = 0;
        let green = 0;
        let blue = 0;
        const pixelCount = sampleSize * sampleSize;

        for (let index = 0; index < pixels.length; index += 4) {
            red += pixels[index];
            green += pixels[index + 1];
            blue += pixels[index + 2];
        }

        return {
            r: red / pixelCount,
            g: green / pixelCount,
            b: blue / pixelCount,
        };
    };

    const resizeAmbientCanvasPreservingFrame = (width: number, height: number) => {
        if (!ambientCanvasElem) return;

        const hadFrame = ambientHasFrame && ambientCanvasElem.width > 0 && ambientCanvasElem.height > 0;
        let previousFrame: HTMLCanvasElement | undefined;

        if (hadFrame) {
            previousFrame = document.createElement("canvas");
            previousFrame.width = ambientCanvasElem.width;
            previousFrame.height = ambientCanvasElem.height;
            const previousCtx = previousFrame.getContext("2d", { alpha: false });
            previousCtx?.drawImage(ambientCanvasElem, 0, 0);
        }

        ambientCanvasElem.width = width;
        ambientCanvasElem.height = height;
        syncCanvasSize(ambientBlendCanvas, width, height);
        syncCanvasSize(ambientSourceCanvas, width, height);

        if (!hadFrame || !previousFrame) {
            resetAmbientFrameState();
            return;
        }

        const ambientCtx = getAmbientContext();
        const blendCtx = getCanvasContext(ambientBlendCanvas);
        if (!ambientCtx || !blendCtx || !ambientBlendCanvas) {
            resetAmbientFrameState();
            return;
        }

        ambientCtx.clearRect(0, 0, width, height);
        ambientCtx.drawImage(previousFrame, 0, 0, width, height);
        blendCtx.clearRect(0, 0, width, height);
        blendCtx.drawImage(previousFrame, 0, 0, width, height);
        ambientHasFrame = true;
    };

    const updateAmbientCanvasSize = () => {
        if (!ambientCanvasElem || !containerElem) return;

        const containerWidth = Math.max(containerElem.clientWidth, 1);
        const containerHeight = Math.max(containerElem.clientHeight, 1);
        const targetWidth = Math.max(
            AMBIENT_MIN_WIDTH,
            Math.min(AMBIENT_MAX_WIDTH, Math.round(containerWidth * 0.22)),
        );
        const targetHeight = Math.max(1, Math.round((containerHeight / containerWidth) * targetWidth));

        if (targetWidth === lastAmbientWidth && targetHeight === lastAmbientHeight) return;

        resizeAmbientCanvasPreservingFrame(targetWidth, targetHeight);
        lastAmbientWidth = targetWidth;
        lastAmbientHeight = targetHeight;
    };

    const updateAmbientState = () => {
        updateEffectiveVideoFit();

        if (hidden || objectFit !== "contain") {
            ambientActive = false;
            resetAmbientFrameState();
            updateAmbientDisplayVisibility();
            return;
        }

        if (!containerElem || !videoElem) {
            ambientActive = false;
            updateAmbientDisplayVisibility();
            return;
        }

        const { videoWidth, videoHeight } = videoElem;
        const containerWidth = containerElem.clientWidth;
        const containerHeight = containerElem.clientHeight;

        if (!videoWidth || !videoHeight || !containerWidth || !containerHeight) {
            if (!ambientHasFrame) {
                ambientActive = false;
            }
            updateAmbientDisplayVisibility();
            return;
        }

        const videoAspect = videoWidth / videoHeight;
        const containerAspect = containerWidth / containerHeight;
        ambientActive = Math.abs(videoAspect - containerAspect) > AMBIENT_ASPECT_EPSILON;

        if (ambientActive) {
            updateAmbientCanvasSize();
        } else {
            stopAmbientLoop();
        }

        updateAmbientDisplayVisibility();
    };

    const drawAmbientFrame = () => {
        if (!ambientActive || !videoElem || !ambientCanvasElem) return;
        if (videoElem.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

        const ctx = getAmbientContext();
        const blendCtx = getCanvasContext(ambientBlendCanvas);
        const sourceCtx = getCanvasContext(ambientSourceCanvas);
        const sampleCtx = getSampleContext();
        if (!ctx) return;
        if (!blendCtx || !sourceCtx || !sampleCtx || !ambientSourceCanvas || !ambientBlendCanvas) {
            return;
        }

        const width = ambientCanvasElem.width;
        const height = ambientCanvasElem.height;
        if (!width || !height) return;

        sourceCtx.imageSmoothingEnabled = true;

        try {
            sourceCtx.clearRect(0, 0, width, height);
            sourceCtx.drawImage(videoElem, 0, 0, width, height);
        } catch {
            return;
        }

        const hadPreviousFrame = ambientHasFrame;
        getAverageFrameColor(sampleCtx, ambientSourceCanvas);

        blendCtx.imageSmoothingEnabled = true;
        blendCtx.globalCompositeOperation = "source-over";
        blendCtx.clearRect(0, 0, width, height);

        if (ambientHasFrame) {
            blendCtx.globalAlpha = 1;
            blendCtx.drawImage(ambientCanvasElem, 0, 0, width, height);
        }

        blendCtx.globalAlpha = hadPreviousFrame ? AMBIENT_BLEND_FACTOR : 1;
        blendCtx.drawImage(ambientSourceCanvas, 0, 0, width, height);
        blendCtx.globalAlpha = 1;

        ctx.drawImage(ambientBlendCanvas, 0, 0, width, height);

        ambientHasFrame = true;
    };

    const stopAmbientLoop = () => {
        ambientLoopRunning = false;
        lastAmbientDrawAt = 0;

        if (ambientRaf) {
            cancelAnimationFrame(ambientRaf);
            ambientRaf = 0;
        }
    };

    const scheduleAmbientLoop = (forceRestart = false) => {
        if (!ambientActive || !videoElem) {
            stopAmbientLoop();
            return;
        }

        if (forceRestart && ambientLoopRunning) {
            stopAmbientLoop();
        }

        if (ambientLoopRunning) return;
        ambientLoopRunning = true;

        const tick = (now: number) => {
            if (!ambientActive || !videoElem) {
                stopAmbientLoop();
                return;
            }

            if (!videoElem.paused && (lastAmbientDrawAt === 0 || now - lastAmbientDrawAt >= AMBIENT_FRAME_INTERVAL_MS)) {
                drawAmbientFrame();
                lastAmbientDrawAt = now;
            }

            ambientRaf = requestAnimationFrame(tick);
        };

        ambientRaf = requestAnimationFrame(tick);
    };

    const refreshAmbient = () => {
        updateAmbientState();
        drawAmbientFrame();
        updateAmbientDisplayVisibility();

        if (!ambientActive) {
            stopAmbientLoop();
            return;
        }

        if (videoElem?.paused) return;
        scheduleAmbientLoop();
    };

    const handleBufferResume = () => {
        updateAmbientState();
        drawAmbientFrame();
        updateAmbientDisplayVisibility();

        if (!ambientActive) {
            stopAmbientLoop();
            return;
        }

        if (videoElem?.paused) return;
        scheduleAmbientLoop(true);
    };

    const bindVideoListeners = (element: HTMLVideoElement | undefined) => {
        detachVideoListeners();

        if (!element) return;

        const events = [
            "loadedmetadata",
            "loadeddata",
            "canplay",
            "play",
            "playing",
            "pause",
            "seeked",
        ] as const;
        const handlePause = () => {
            drawAmbientFrame();
            stopAmbientLoop();
            updateAmbientDisplayVisibility();
        };

        const listeners = new Map<string, EventListener>();

        for (const eventName of events) {
            let listener: EventListener;
            if (eventName === "pause") {
                listener = handlePause;
            } else if (eventName === "playing") {
                listener = handleBufferResume;
            } else {
                listener = refreshAmbient;
            }
            listeners.set(eventName, listener);
            element.addEventListener(eventName, listener);
        }

        detachVideoListeners = () => {
            for (const [eventName, listener] of listeners) {
                element.removeEventListener(eventName, listener);
            }
        };
    };

    $: bindVideoListeners(videoElem);
    $: refreshAmbient();
    $: updateEffectiveVideoFit();

    onMount(() => {
        ambientBlendCanvas = document.createElement("canvas");
        ambientSourceCanvas = document.createElement("canvas");
        ambientSampleCanvas = document.createElement("canvas");

        if (typeof ResizeObserver !== "undefined") {
            resizeObserver = new ResizeObserver(() => {
                updateAmbientCanvasSize();
                refreshAmbient();
            });

            if (containerElem) {
                resizeObserver.observe(containerElem);
            }
        }

        refreshAmbient();
    });

    onDestroy(() => {
        stopAmbientLoop();
        detachVideoListeners();
        resizeObserver?.disconnect();
    });
</script>

<div bind:this={containerElem} class="relative w-full h-full bg-black overflow-hidden">
    <canvas
        bind:this={ambientCanvasElem}
        class="pointer-events-none absolute inset-[-8%] z-0 h-[116%] w-[116%] origin-center scale-[1.12] saturate-[1.55] {ambientDisplayVisible ? 'opacity-100' : 'opacity-0'}"
        aria-hidden="true"
    ></canvas>

    <video
        bind:this={videoElem}
        class="absolute top-0 left-0 z-10 h-full w-full {hidden ? 'hidden' : 'block'} {effectiveObjectFit === 'contain'
            ? 'object-contain'
            : 'object-cover'}"
        style={`object-position: ${effectiveObjectPosition}; transform: ${effectiveTransform}; transform-origin: center center;`}
        crossorigin="anonymous"
        playsinline
        disablepictureinpicture
        on:timeupdate
        on:play
        on:pause
        on:ended
        on:click
        on:waiting
        on:playing
        on:canplay
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
