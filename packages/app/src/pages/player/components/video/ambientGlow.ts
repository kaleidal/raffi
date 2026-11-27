import type { ContentRect } from "../../../../lib/media/crop/barDetection";
import { pictureAspect } from "./videoFit";

const AMBIENT_ASPECT_EPSILON = 0.015;
const AMBIENT_MIN_WIDTH = 160;
const AMBIENT_MAX_WIDTH = 420;
const AMBIENT_BLEND_FACTOR = 0.14;
const AMBIENT_SAMPLE_GRID = 4;
const AMBIENT_FRAME_INTERVAL_MS = 1000 / 10;

type AmbientGlowOptions = {
    getContainer: () => HTMLDivElement | undefined;
    getCanvas: () => HTMLCanvasElement | undefined;
    getVideo: () => HTMLVideoElement | undefined;
    getCrop: () => ContentRect;
    syncVideoFit: () => void;
    onVisibilityChange: (visible: boolean) => void;
};

const syncCanvasSize = (canvas: HTMLCanvasElement | undefined, width: number, height: number) => {
    if (!canvas) return;
    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
};

const getCanvasContext = (canvas: HTMLCanvasElement | undefined) => canvas?.getContext("2d", { alpha: false }) ?? null;

const getAverageFrameColor = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    const sampleSize = AMBIENT_SAMPLE_GRID;

    if (ctx.canvas.width !== sampleSize || ctx.canvas.height !== sampleSize) {
        ctx.canvas.width = sampleSize;
        ctx.canvas.height = sampleSize;
    }

    let pixels: Uint8ClampedArray;
    try {
        ctx.clearRect(0, 0, sampleSize, sampleSize);
        ctx.drawImage(canvas, 0, 0, sampleSize, sampleSize);
        pixels = ctx.getImageData(0, 0, sampleSize, sampleSize).data;
    } catch {
        return null;
    }
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

/** Paints a blurred, slowly blended copy of the video into the letterbox area around it. */
export function createAmbientGlow(options: AmbientGlowOptions) {
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
    let ambientReadBlocked = false;

    const getAmbientContext = () => options.getCanvas()?.getContext("2d", { alpha: false }) ?? null;
    const getSampleContext = () => ambientSampleCanvas?.getContext("2d", {
        alpha: false,
        willReadFrequently: true,
    }) ?? null;

    const resetAmbientFrameState = () => {
        ambientHasFrame = false;
    };

    const disableAmbientReadback = () => {
        ambientReadBlocked = true;
        ambientActive = false;
        options.onVisibilityChange(false);
        resetAmbientFrameState();
        stopAmbientLoop();
    };

    const updateAmbientDisplayVisibility = () => {
        options.onVisibilityChange(ambientActive || ambientHasFrame);
    };

    const resizeAmbientCanvasPreservingFrame = (width: number, height: number) => {
        const ambientCanvasElem = options.getCanvas();
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
        const containerElem = options.getContainer();
        if (!options.getCanvas() || !containerElem) return;

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
        options.syncVideoFit();

        const containerElem = options.getContainer();
        const videoElem = options.getVideo();
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

        const videoAspect = pictureAspect({ width: videoWidth, height: videoHeight }, options.getCrop());
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
        const videoElem = options.getVideo();
        const ambientCanvasElem = options.getCanvas();
        if (ambientReadBlocked || !ambientActive || !videoElem || !ambientCanvasElem) return;
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
            const crop = options.getCrop();
            const { videoWidth, videoHeight } = videoElem;
            sourceCtx.clearRect(0, 0, width, height);
            sourceCtx.drawImage(
                videoElem,
                crop.left * videoWidth,
                crop.top * videoHeight,
                (crop.right - crop.left) * videoWidth,
                (crop.bottom - crop.top) * videoHeight,
                0,
                0,
                width,
                height,
            );
        } catch {
            return;
        }

        const hadPreviousFrame = ambientHasFrame;
        if (!getAverageFrameColor(sampleCtx, ambientSourceCanvas)) {
            disableAmbientReadback();
            return;
        }

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
        if (!ambientActive || !options.getVideo()) {
            stopAmbientLoop();
            return;
        }

        if (forceRestart && ambientLoopRunning) {
            stopAmbientLoop();
        }

        if (ambientLoopRunning) return;
        ambientLoopRunning = true;

        const tick = (now: number) => {
            const videoElem = options.getVideo();
            if (!ambientActive || !videoElem) {
                stopAmbientLoop();
                return;
            }

            if (
                typeof document !== "undefined" &&
                document.hidden
            ) {
                ambientRaf = requestAnimationFrame(tick);
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

        if (options.getVideo()?.paused) return;
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

        if (options.getVideo()?.paused) return;
        scheduleAmbientLoop(true);
    };

    const bindVideo = (element: HTMLVideoElement | undefined) => {
        detachVideoListeners();

        if (!element) return;
        ambientReadBlocked = false;

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

    const mount = () => {
        ambientBlendCanvas = document.createElement("canvas");
        ambientSourceCanvas = document.createElement("canvas");
        ambientSampleCanvas = document.createElement("canvas");

        if (typeof ResizeObserver !== "undefined") {
            resizeObserver = new ResizeObserver(() => {
                updateAmbientCanvasSize();
                refreshAmbient();
            });

            const containerElem = options.getContainer();
            if (containerElem) {
                resizeObserver.observe(containerElem);
            }
        }

        const handleVisibility = () => {
            if (document.hidden) {
                stopAmbientLoop();
                return;
            }
            refreshAmbient();
        };
        document.addEventListener("visibilitychange", handleVisibility);

        refreshAmbient();

        return () => {
            document.removeEventListener("visibilitychange", handleVisibility);
        };
    };

    const destroy = () => {
        stopAmbientLoop();
        detachVideoListeners();
        resizeObserver?.disconnect();
    };

    return {
        bindVideo,
        refresh: refreshAmbient,
        mount,
        destroy,
    };
}
