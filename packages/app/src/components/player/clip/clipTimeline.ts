export const MIN_CLIP_GAP = 0.1;

const THUMB_HIT_SLOP = 14;

export type ClipRange = { start: number; end: number };

/** The zoomed window of the bar, in slider units. */
export type ClipView = { min: number; max: number };

export const clamp = (v: number, min: number, max: number) =>
    Math.min(max, Math.max(min, v));

const minViewSpan = (clipMax: number) => Math.min(clipMax, 5);

export const normalizeClipView = (view: ClipView, clipMax: number): ClipView => {
    if (!isFinite(clipMax) || clipMax <= 0) return view;
    let min = clamp(view.min, 0, clipMax);
    let max = clamp(view.max, 0, clipMax);
    if (max < min) {
        const tmp = min;
        min = max;
        max = tmp;
    }
    const minSpan = minViewSpan(clipMax);
    if (max - min < minSpan) {
        const mid = (min + max) / 2;
        min = clamp(mid - minSpan / 2, 0, clipMax - minSpan);
        max = min + minSpan;
    }
    return { min, max };
};

export const normalizeClipRange = (range: ClipRange, clipMax: number): ClipRange => {
    if (!isFinite(clipMax) || clipMax <= 0) return range;
    let start = clamp(range.start, 0, clipMax);
    let end = clamp(range.end, 0, clipMax);
    if (end < start + MIN_CLIP_GAP) {
        end = clamp(start + MIN_CLIP_GAP, 0, clipMax);
    }
    if (start > end - MIN_CLIP_GAP) {
        start = clamp(end - MIN_CLIP_GAP, 0, clipMax);
    }
    return { start, end };
};

/** Zooms around the cursor, or returns null when the current view has no usable span. */
export const zoomView = (
    view: ClipView,
    cursorFrac: number,
    zoomIn: boolean,
    clipMax: number,
): ClipView | null => {
    const span = view.max - view.min;
    if (!isFinite(span) || span <= 0) return null;

    const cursorSlider = view.min + cursorFrac * span;
    const factor = zoomIn ? 0.85 : 1.15;
    const newSpan = clamp(span * factor, minViewSpan(clipMax), clipMax);

    // Keep cursor position stable while zooming.
    const newMin = cursorSlider - cursorFrac * newSpan;
    const min = clamp(newMin, 0, clipMax - newSpan);
    return { min, max: min + newSpan };
};

/** Position of a slider value as a percentage of the visible view, unclamped so off-screen values fall outside 0–100. */
export const viewPercent = (sliderV: number, view: ClipView) => {
    const span = view.max - view.min;
    if (!(span > 0)) return 0;
    return ((sliderV - view.min) / span) * 100;
};

const sliderToXInView = (sliderV: number, rectWidth: number, view: ClipView) => {
    const span = Math.max(0.0001, view.max - view.min);
    const frac = (sliderV - view.min) / span;
    return clamp(frac * rectWidth, 0, rectWidth);
};

export const hitTestThumb = (
    x: number,
    rectWidth: number,
    sliders: ClipRange,
    view: ClipView,
) => {
    const startInView = sliders.start >= view.min && sliders.start <= view.max;
    const endInView = sliders.end >= view.min && sliders.end <= view.max;
    if (!startInView && !endInView) return null;

    const startX = sliderToXInView(sliders.start, rectWidth, view);
    const endX = sliderToXInView(sliders.end, rectWidth, view);
    const distStart = startInView ? Math.abs(x - startX) : Number.POSITIVE_INFINITY;
    const distEnd = endInView ? Math.abs(x - endX) : Number.POSITIVE_INFINITY;
    if (Math.min(distStart, distEnd) > THUMB_HIT_SLOP) return null;
    return distStart <= distEnd ? "start" : "end";
};
