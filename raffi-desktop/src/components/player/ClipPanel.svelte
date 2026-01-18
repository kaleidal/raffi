<script lang="ts">
    import { slide } from "svelte/transition";
    import { createClip } from "../../lib/client";
    import { formatTime } from "../../lib/time";
    import { createEventDispatcher } from "svelte";

    export let open = false;
    export let sessionId: string;
    export let duration = 0;
    export let currentTime = 0;
    export let isWatchPartyMember = false;
    export let inverted = false;

    const dispatch = createEventDispatcher();

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

    const minGap = 0.1;

    const formatClipTimeLabel = (t: number) => {
        // If the main seekbar is inverted and we know duration, mirror that style:
        // show remaining as a negative value (e.g. -3:03).
        if (inverted && duration > 0 && isFinite(duration)) {
            const remaining = Math.max(0, duration - t);
            return `-${formatTime(remaining)}`;
        }
        return formatTime(t);
    };

    const clamp = (v: number, min: number, max: number) =>
        Math.min(max, Math.max(min, v));

    const toSliderValue = (t: number) => (inverted ? clipMax - t : t);
    const fromSliderValue = (v: number) => (inverted ? clipMax - v : v);

    const normalizeView = () => {
        if (!isFinite(clipMax) || clipMax <= 0) return;
        viewMinSlider = clamp(viewMinSlider, 0, clipMax);
        viewMaxSlider = clamp(viewMaxSlider, 0, clipMax);
        if (viewMaxSlider < viewMinSlider) {
            const tmp = viewMinSlider;
            viewMinSlider = viewMaxSlider;
            viewMaxSlider = tmp;
        }
        const minSpan = Math.min(clipMax, 5);
        if (viewMaxSlider - viewMinSlider < minSpan) {
            const mid = (viewMinSlider + viewMaxSlider) / 2;
            viewMinSlider = clamp(mid - minSpan / 2, 0, clipMax - minSpan);
            viewMaxSlider = viewMinSlider + minSpan;
        }
    };

    const setViewAround = (centerSlider: number, span: number) => {
        if (!isFinite(clipMax) || clipMax <= 0) return;
        const s = clamp(span, Math.min(clipMax, 5), clipMax);
        viewMinSlider = clamp(centerSlider - s / 2, 0, clipMax - s);
        viewMaxSlider = viewMinSlider + s;
        normalizeView();
    };

    const normalizeRange = () => {
        if (!isFinite(clipMax) || clipMax <= 0) return;
        clipStart = clamp(clipStart, 0, clipMax);
        clipEnd = clamp(clipEnd, 0, clipMax);
        if (clipEnd < clipStart + minGap) {
            clipEnd = clamp(clipStart + minGap, 0, clipMax);
        }
        if (clipStart > clipEnd - minGap) {
            clipStart = clamp(clipEnd - minGap, 0, clipMax);
        }
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

        startSlider = toSliderValue(clipStart);
        endSlider = toSliderValue(clipEnd);
    };

    $: if (open) resetDefaults();

    const close = () => {
        if (clipBusy) return;
        dispatch("close");
    };

    const onClipStartInput = (e: Event) => {
        const v = Number((e.target as HTMLInputElement).value);
        let t = fromSliderValue(v);
        t = clamp(t, 0, clipMax);
        t = Math.min(t, clipEnd - minGap);
        clipStart = t;
        normalizeRange();
        startSlider = toSliderValue(clipStart);
    };

    const onClipEndInput = (e: Event) => {
        const v = Number((e.target as HTMLInputElement).value);
        let t = fromSliderValue(v);
        t = clamp(t, 0, clipMax);
        t = Math.max(t, clipStart + minGap);
        clipEnd = t;
        normalizeRange();
        endSlider = toSliderValue(clipEnd);
    };

    const applyTrackClickTime = (t: number) => {
        // Track click behavior:
        // - Only the NON-selected (non-white) parts move handles.
        // - Clicking inside the selected (white) range does nothing.
        if (t < clipStart) {
            activeHandle = "start";
            clipStart = Math.min(t, clipEnd - minGap);
        } else if (t > clipEnd) {
            activeHandle = "end";
            clipEnd = Math.max(t, clipStart + minGap);
        } else {
            return;
        }

        normalizeRange();
        startSlider = toSliderValue(clipStart);
        endSlider = toSliderValue(clipEnd);
    };

    const getPointerTime = (e: PointerEvent) => {
        const el = e.currentTarget as HTMLElement | null;
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0) return null;
        const x = clamp(e.clientX - rect.left, 0, rect.width);
        const span = Math.max(0.0001, viewMaxSlider - viewMinSlider);
        const sliderV = viewMinSlider + (x / rect.width) * span;
        const t = clamp(fromSliderValue(sliderV), 0, clipMax);
        return { rect, x, t };
    };

    const sliderToXInView = (sliderV: number, rectWidth: number) => {
        const span = Math.max(0.0001, viewMaxSlider - viewMinSlider);
        const frac = (sliderV - viewMinSlider) / span;
        return clamp(frac * rectWidth, 0, rectWidth);
    };

    const hitTestThumb = (x: number, rectWidth: number) => {
        const startInView = startSlider >= viewMinSlider && startSlider <= viewMaxSlider;
        const endInView = endSlider >= viewMinSlider && endSlider <= viewMaxSlider;
        if (!startInView && !endInView) return null;

        const startX = sliderToXInView(startSlider, rectWidth);
        const endX = sliderToXInView(endSlider, rectWidth);
        const distStart = startInView ? Math.abs(x - startX) : Number.POSITIVE_INFINITY;
        const distEnd = endInView ? Math.abs(x - endX) : Number.POSITIVE_INFINITY;
        const thumbHitSlop = 14;
        if (Math.min(distStart, distEnd) > thumbHitSlop) return null;
        return distStart <= distEnd ? "start" : "end";
    };

    const setHandleTime = (handle: "start" | "end", t: number) => {
        if (handle === "start") {
            clipStart = Math.min(clamp(t, 0, clipMax), clipEnd - minGap);
        } else {
            clipEnd = Math.max(clamp(t, 0, clipMax), clipStart + minGap);
        }
        normalizeRange();
        startSlider = toSliderValue(clipStart);
        endSlider = toSliderValue(clipEnd);
    };

    const onBarPointerDown = (e: PointerEvent) => {
        if (clipBusy) return;
        if (!isFinite(clipMax) || clipMax <= 0) return;

        const info = getPointerTime(e);
        if (!info) return;

        const thumb = hitTestThumb(info.x, info.rect.width);
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
        const span = viewMaxSlider - viewMinSlider;
        if (!isFinite(span) || span <= 0) return;

        const cursorFrac = x / rect.width;
        const cursorSlider = viewMinSlider + cursorFrac * span;

        const zoomIn = e.deltaY < 0;
        const factor = zoomIn ? 0.85 : 1.15;
        const newSpan = clamp(span * factor, Math.min(clipMax, 5), clipMax);

        // Keep cursor position stable while zooming.
        const newMin = cursorSlider - cursorFrac * newSpan;
        viewMinSlider = clamp(newMin, 0, clipMax - newSpan);
        viewMaxSlider = viewMinSlider + newSpan;
        normalizeView();
    };

    const confirmClip = async () => {
        clipError = "";
        clipOutputPath = "";

        const start = Math.max(0, clipStart);
        const end = Math.max(start + minGap, clipEnd);

        // Optional Save-As prompt (Electron). Browser builds fall back to server default dir.
        let outputPath: string | undefined = undefined;
        if (window.electronAPI?.saveClipPath) {
            const suggested = `clip_${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}.mp4`;
            const res = await window.electronAPI.saveClipPath(suggested);
            if (res?.canceled) {
                return;
            }
            if (res?.filePath) {
                outputPath = res.filePath;
            }
        }

        clipBusy = true;
        try {
            const res = await createClip(sessionId, { start, end, outputPath });
            clipOutputPath = res.outputPath;
        } catch (err) {
            clipError = err instanceof Error ? err.message : String(err);
        } finally {
            clipBusy = false;
        }
    };

    // Keep slider positions aligned to the shared 0..clipMax scale.
    $: if (open) {
        startSlider = toSliderValue(clipStart);
        endSlider = toSliderValue(clipEnd);
    }

    $: nowSlider = toSliderValue(Math.min(Math.max(0, currentTime), clipMax));
    $: {
        const span = viewMaxSlider - viewMinSlider;
        nowLeft = span > 0 ? clamp(((nowSlider - viewMinSlider) / span) * 100, 0, 100) : 0;
    }

    // Selection is rendered based on slider positions so it always matches the thumbs
    // (including inverted mode).
    $: {
        const span = viewMaxSlider - viewMinSlider;
        const a = Math.min(startSlider, endSlider);
        const b = Math.max(startSlider, endSlider);
        const left = span > 0 ? clamp(((a - viewMinSlider) / span) * 100, 0, 100) : 0;
        const right = span > 0 ? clamp(((b - viewMinSlider) / span) * 100, 0, 100) : 0;
        selectedLeft = Math.min(left, right);
        selectedWidth = Math.max(0, right - left);
    }

    $: startLeft = (() => {
        const span = viewMaxSlider - viewMinSlider;
        if (!(span > 0)) return 0;
        return ((startSlider - viewMinSlider) / span) * 100;
    })();
    $: endLeft = (() => {
        const span = viewMaxSlider - viewMinSlider;
        if (!(span > 0)) return 0;
        return ((endSlider - viewMinSlider) / span) * 100;
    })();
    $: startVisible = startLeft >= 0 && startLeft <= 100;
    $: endVisible = endLeft >= 0 && endLeft <= 100;
</script>

{#if open && !isWatchPartyMember}
    <div
        in:slide={{ duration: 200, axis: "y" }}
        out:slide={{ duration: 200, axis: "y" }}
        class="w-full px-2"
    >
        <div class="rounded-[24px] bg-[#000000]/10 backdrop-blur-[24px] px-5 py-4">
            <div class="flex items-center justify-between gap-4">
                <div class="flex items-center gap-3">
                    <span class="text-[16px] font-poppins font-[500] text-[#D3D3D3]">Start</span>
                    <span
                        class="text-[16px] font-poppins font-[500] text-white"
                        style="font-variant-numeric: tabular-nums; font-feature-settings:'tnum';"
                    >{formatClipTimeLabel(clipStart)}</span>
                    <span class="text-[16px] font-poppins font-[500] text-[#D3D3D3]">End</span>
                    <span
                        class="text-[16px] font-poppins font-[500] text-white"
                        style="font-variant-numeric: tabular-nums; font-feature-settings:'tnum';"
                    >{formatClipTimeLabel(clipEnd)}</span>
                </div>

                <div class="flex items-center gap-3">
                    <button
                        class="text-[14px] font-poppins font-[500] text-[#D3D3D3] hover:opacity-80 transition-opacity duration-200"
                        on:click={close}
                        disabled={clipBusy}
                    >
                        Cancel
                    </button>
                    <button
                        class="text-[14px] font-poppins font-[600] text-white hover:opacity-80 transition-opacity duration-200"
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
                    on:pointerdown={onBarPointerDown}
                    on:pointermove={onBarPointerMove}
                    on:pointerup={onBarPointerUp}
                    on:pointercancel={onBarPointerUp}
                    on:wheel|preventDefault|stopPropagation={onBarWheel}
                >
                    <div class="clip-track absolute inset-y-[3px] left-0 right-0 rounded-full bg-[#A3A3A3]/30"></div>
                    <div
                        class="clip-selected absolute inset-y-[3px] rounded-full bg-white"
                        style={`left:${selectedLeft}%; width:${selectedWidth}%`}
                    ></div>

                    <!-- 'Now' marker so you can see what you're clipping around -->
                    <div
                        class="clip-now absolute top-[1px] bottom-[1px] w-[2px] bg-white/60"
                        style={`left:${nowLeft}%; transform: translateX(-1px);`}
                    ></div>

                    <!-- Custom thumbs so zoom doesn't clamp/move handle state -->
                    {#if startVisible}
                        <div
                            class="clip-thumb absolute top-1/2 w-[18px] h-[18px] rounded-full bg-white"
                            style={`left:${clamp(startLeft, 0, 100)}%; transform: translate(-50%, -50%); z-index:${activeHandle === 'start' ? 3 : 2};`}
                        ></div>
                    {/if}
                    {#if endVisible}
                        <div
                            class="clip-thumb absolute top-1/2 w-[18px] h-[18px] rounded-full bg-white"
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
                <div class="mt-3 text-[14px] font-poppins text-[#D3D3D3]">
                    {clipError}
                </div>
            {/if}

            {#if clipOutputPath}
                <div class="mt-3 text-[14px] font-poppins text-[#D3D3D3] break-all">
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
