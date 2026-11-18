<script lang="ts">
    import { slide } from "svelte/transition";
    import { createClip } from "../../../lib/shell/client";
    import { formatTime } from "../../../lib/utils/time";
    import {
        MIN_CLIP_GAP,
        clamp,
        hitTestThumb,
        normalizeClipRange,
        normalizeClipView,
        viewPercent,
        zoomView,
    } from "./clipTimeline";

    export let open = false;
    export let videoSrc: string | null = null;
    export let duration = 0;
    export let currentTime = 0;

    export let onClose: () => void = () => {};

    let clipStart = 0;
    let clipEnd = 0;
    let clipMax = 0;
    let startSlider = 0;
    let endSlider = 0;
    let viewMinSlider = 0;
    let viewMaxSlider = 0;
    let nowSlider = 0;
    let nowLeft = 0;
    let selectedLeft = 0;
    let selectedWidth = 0;
    let startLeft = 0;
    let endLeft = 0;
    let startVisible = true;
    let endVisible = true;
    let clipBusy = false;
    let clipError = "";
    let clipOutputPath = "";

    let activeHandle: "start" | "end" = "end";

    let dragHandle: "start" | "end" | null = null;


    const normalizeView = () => {
        ({ min: viewMinSlider, max: viewMaxSlider } = normalizeClipView(
            { min: viewMinSlider, max: viewMaxSlider },
            clipMax,
        ));
    };

    const normalizeRange = () => {
        ({ start: clipStart, end: clipEnd } = normalizeClipRange(
            { start: clipStart, end: clipEnd },
            clipMax,
        ));
    };

    const resetDefaults = () => {
        clipError = "";
        clipOutputPath = "";

        const now = Math.max(0, currentTime);
        clipMax = duration > 0 ? duration : now;
        const defaultWindow = 20;
        const end = clamp(now, 0, clipMax);
        const start = clamp(end - defaultWindow, 0, end);
        clipStart = start;
        clipEnd = end;
        normalizeRange();

        // Default zoom shows the whole bar; wheel can zoom in.
        viewMinSlider = 0;
        viewMaxSlider = clipMax;
        normalizeView();

        startSlider = clipStart;
        endSlider = clipEnd;
    };

    $: if (open) resetDefaults();

    const close = () => {
        if (clipBusy) return;
        onClose();
    };

    const onClipStartInput = (e: Event) => {
        const v = Number((e.target as HTMLInputElement).value);
        let t = v;
        t = clamp(t, 0, clipMax);
        t = Math.min(t, clipEnd - MIN_CLIP_GAP);
        clipStart = t;
        normalizeRange();
        startSlider = clipStart;
    };

    const onClipEndInput = (e: Event) => {
        const v = Number((e.target as HTMLInputElement).value);
        let t = v;
        t = clamp(t, 0, clipMax);
        t = Math.max(t, clipStart + MIN_CLIP_GAP);
        clipEnd = t;
        normalizeRange();
        endSlider = clipEnd;
    };

    const applyTrackClickTime = (t: number) => {
        // Track click behavior:
        // - Only the NON-selected (non-white) parts move handles.
        // - Clicking inside the selected (white) range does nothing.
        if (t < clipStart) {
            activeHandle = "start";
            clipStart = Math.min(t, clipEnd - MIN_CLIP_GAP);
        } else if (t > clipEnd) {
            activeHandle = "end";
            clipEnd = Math.max(t, clipStart + MIN_CLIP_GAP);
        } else {
            return;
        }

        normalizeRange();
        startSlider = clipStart;
        endSlider = clipEnd;
    };

    const getPointerTime = (e: PointerEvent) => {
        const el = e.currentTarget as HTMLElement | null;
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0) return null;
        const x = clamp(e.clientX - rect.left, 0, rect.width);
        const span = Math.max(0.0001, viewMaxSlider - viewMinSlider);
        const sliderV = viewMinSlider + (x / rect.width) * span;
        const t = clamp(sliderV, 0, clipMax);
        return { rect, x, t };
    };

    const setHandleTime = (handle: "start" | "end", t: number) => {
        if (handle === "start") {
            clipStart = Math.min(clamp(t, 0, clipMax), clipEnd - MIN_CLIP_GAP);
        } else {
            clipEnd = Math.max(clamp(t, 0, clipMax), clipStart + MIN_CLIP_GAP);
        }
        normalizeRange();
        startSlider = clipStart;
        endSlider = clipEnd;
    };

    const onBarPointerDown = (e: PointerEvent) => {
        if (clipBusy) return;
        if (!isFinite(clipMax) || clipMax <= 0) return;

        const info = getPointerTime(e);
        if (!info) return;

        const thumb = hitTestThumb(
            info.x,
            info.rect.width,
            { start: startSlider, end: endSlider },
            { min: viewMinSlider, max: viewMaxSlider },
        );
        if (thumb) {
            activeHandle = thumb;
            dragHandle = thumb;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            e.preventDefault();
            return;
        }

        // Only allow track clicks on the non-selected (dark) regions.
        // Clicking inside the selected (white) range does nothing.
        applyTrackClickTime(info.t);
    };

    const onBarPointerMove = (e: PointerEvent) => {
        if (!dragHandle) return;
        if (clipBusy) return;
        if (!isFinite(clipMax) || clipMax <= 0) return;
        const info = getPointerTime(e);
        if (!info) return;
        e.preventDefault();
        setHandleTime(dragHandle, info.t);
    };

    const onBarPointerUp = (e: PointerEvent) => {
        if (!dragHandle) return;
        dragHandle = null;
        try {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
            // ignore
        }
    };

    const onBarWheel = (e: WheelEvent) => {
        if (clipBusy) return;
        if (!isFinite(clipMax) || clipMax <= 0) return;

        // Zoom in/out around cursor. Trackpad gives small deltas; wheel gives larger.
        e.preventDefault();

        const el = e.currentTarget as HTMLElement | null;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0) return;

        const x = clamp(e.clientX - rect.left, 0, rect.width);
        const zoomed = zoomView(
            { min: viewMinSlider, max: viewMaxSlider },
            x / rect.width,
            e.deltaY < 0,
            clipMax,
        );
        if (!zoomed) return;

        viewMinSlider = zoomed.min;
        viewMaxSlider = zoomed.max;
        normalizeView();
    };

    const confirmClip = async () => {
        clipError = "";
        clipOutputPath = "";

        if (!videoSrc) {
            clipError = "No video source to clip";
            return;
        }

        const start = Math.max(0, clipStart);
        const end = Math.max(start + MIN_CLIP_GAP, clipEnd);

        let targetPath: string | null = null;
        if (window.electronAPI?.saveClipPath) {
            const suggested = `clip_${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}.mp4`;
            const res = await window.electronAPI.saveClipPath(suggested);
            if (res?.canceled) {
                return;
            }
            if (res?.filePath) {
                targetPath = res.filePath;
            }
        }

        clipBusy = true;
        try {
            const clipName = targetPath
                ? targetPath.split(/[\\/]/).pop() || undefined
                : undefined;
            const res = await createClip({
                source: videoSrc,
                start,
                end,
                name: clipName,
                outputPath: targetPath || undefined,
            });
            clipOutputPath = res.outputPath;
        } catch (err) {
            clipError = err instanceof Error ? err.message : String(err);
        } finally {
            clipBusy = false;
        }
    };

    // Keep slider positions aligned to the shared 0..clipMax scale.
    $: if (open) {
        startSlider = clipStart;
        endSlider = clipEnd;
    }

    $: nowSlider = Math.min(Math.max(0, currentTime), clipMax);
    $: nowLeft = clamp(viewPercent(nowSlider, { min: viewMinSlider, max: viewMaxSlider }), 0, 100);

    // Selection is rendered based on slider positions so it always matches the thumbs.
    $: {
        const view = { min: viewMinSlider, max: viewMaxSlider };
        const left = clamp(viewPercent(Math.min(startSlider, endSlider), view), 0, 100);
        const right = clamp(viewPercent(Math.max(startSlider, endSlider), view), 0, 100);
        selectedLeft = Math.min(left, right);
        selectedWidth = Math.max(0, right - left);
    }

    $: startLeft = viewPercent(startSlider, { min: viewMinSlider, max: viewMaxSlider });
    $: endLeft = viewPercent(endSlider, { min: viewMinSlider, max: viewMaxSlider });
    $: startVisible = startLeft >= 0 && startLeft <= 100;
    $: endVisible = endLeft >= 0 && endLeft <= 100;
</script>

{#if open}
    <div
        in:slide={{ duration: 200, axis: "y" }}
        out:slide={{ duration: 200, axis: "y" }}
        class="w-full px-2"
    >
        <div class="rounded-[24px] bg-canvas/10 backdrop-blur-[24px] px-5 py-4">
            <div class="flex items-center justify-between gap-4">
                <div class="flex items-center gap-3">
                    <span class="text-[1rem] font-[500] text-ink/85">Start</span>
                    <span
                        class="text-[1rem] font-[500] text-ink"
                        style="font-variant-numeric: tabular-nums; font-feature-settings:'tnum';"
                    >{formatTime(clipStart)}</span>
                    <span class="text-[1rem] font-[500] text-ink/85">End</span>
                    <span
                        class="text-[1rem] font-[500] text-ink"
                        style="font-variant-numeric: tabular-nums; font-feature-settings:'tnum';"
                    >{formatTime(clipEnd)}</span>
                </div>

                <div class="flex items-center gap-3">
                    <button
                        class="text-[0.875rem] font-[500] text-ink/85 hover:opacity-80 transition-opacity duration-200"
                        on:click={close}
                        disabled={clipBusy}
                    >
                        Cancel
                    </button>
                    <button
                        class="text-[0.875rem] font-[600] text-ink hover:opacity-80 transition-opacity duration-200"
                        on:click={confirmClip}
                        disabled={clipBusy}
                    >
                        {clipBusy ? "Saving…" : "Save Clip"}
                    </button>
                </div>
            </div>

            <div class="mt-3">
                <div
                    class="clip-range relative w-full h-[10px]"
                    role="slider"
                    tabindex="0"
                    aria-label="Clip range selector"
                    aria-valuenow={clipStart}
                    aria-valuemin={0}
                    aria-valuemax={duration}
                    on:pointerdown={onBarPointerDown}
                    on:pointermove={onBarPointerMove}
                    on:pointerup={onBarPointerUp}
                    on:pointercancel={onBarPointerUp}
                    on:wheel|preventDefault|stopPropagation={onBarWheel}
                >
                    <div class="clip-track absolute inset-y-[3px] left-0 right-0 rounded-full bg-ink/20"></div>
                    <div
                        class="clip-selected absolute inset-y-[3px] rounded-full bg-accent"
                        style={`left:${selectedLeft}%; width:${selectedWidth}%`}
                    ></div>

                    <!-- 'Now' marker so you can see what you're clipping around -->
                    <div
                        class="clip-now absolute top-[1px] bottom-[1px] w-[2px] bg-ink/60"
                        style={`left:${nowLeft}%; transform: translateX(-1px);`}
                    ></div>

                    <!-- Custom thumbs so zoom doesn't clamp/move handle state -->
                    {#if startVisible}
                        <div
                            class="clip-thumb absolute top-1/2 w-[18px] h-[18px] rounded-full bg-accent"
                            style={`left:${clamp(startLeft, 0, 100)}%; transform: translate(-50%, -50%); z-index:${activeHandle === 'start' ? 3 : 2};`}
                        ></div>
                    {/if}
                    {#if endVisible}
                        <div
                            class="clip-thumb absolute top-1/2 w-[18px] h-[18px] rounded-full bg-accent"
                            style={`left:${clamp(endLeft, 0, 100)}%; transform: translate(-50%, -50%); z-index:${activeHandle === 'end' ? 3 : 2};`}
                        ></div>
                    {/if}

                    <input
                        type="range"
                        min={0}
                        max={clipMax}
                        step={0.1}
                        bind:value={startSlider}
                        on:input={onClipStartInput}
                        on:focus={() => (activeHandle = "start")}
                        style={`z-index:${activeHandle === "start" ? 3 : 2}`}
                        class="clip-input absolute inset-0 w-full appearance-none bg-transparent cursor-pointer"
                        disabled={clipBusy}
                    />
                    <input
                        type="range"
                        min={0}
                        max={clipMax}
                        step={0.1}
                        bind:value={endSlider}
                        on:input={onClipEndInput}
                        on:focus={() => (activeHandle = "end")}
                        style={`z-index:${activeHandle === "end" ? 3 : 2}`}
                        class="clip-input absolute inset-0 w-full appearance-none bg-transparent cursor-pointer"
                        disabled={clipBusy}
                    />
                </div>
            </div>

            {#if clipError}
                <div class="mt-3 text-[0.875rem] text-ink/85">
                    {clipError}
                </div>
            {/if}

            {#if clipOutputPath}
                <div class="mt-3 text-[0.875rem] text-ink/85 break-all">
                    Saved: {clipOutputPath}
                </div>
            {/if}
        </div>
    </div>
{/if}

<style>
    .clip-range {
        touch-action: none;
        overscroll-behavior: contain;
        user-select: none;
    }

    /* Pointer interactions are handled by the bar so the two overlapping inputs
       can't steal clicks/drags from each other. Inputs remain for keyboard support. */
    .clip-input {
        pointer-events: none;
    }

    /* Hide native thumbs; we render custom ones above. */
    .clip-input::-webkit-slider-thumb {
        appearance: none;
        width: 0;
        height: 0;
    }

    .clip-input::-moz-range-thumb {
        width: 0;
        height: 0;
        border: none;
    }

    .clip-input::-ms-thumb {
        width: 0;
        height: 0;
        border: none;
    }

    .clip-input::-webkit-slider-runnable-track {
        background: transparent;
        border: none;
    }
    .clip-input::-moz-range-track {
        background: transparent;
        border: none;
    }
    .clip-input::-ms-track {
        background: transparent;
        border: none;
        color: transparent;
    }
</style>
