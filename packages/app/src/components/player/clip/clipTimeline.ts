export const MIN_CLIP_LENGTH = 0.5;
export const DEFAULT_CLIP_LENGTH = 20;

const HANDLE_HIT_SLOP_PX = 16;
const MIN_VIEW_SPAN = 5;
const DEFAULT_VIEW_SPAN = 90;

export type ClipRange = { start: number; end: number };

/** The stretch of the video the timeline shows, in seconds. */
export type ClipView = { min: number; max: number };

export type ClipGrab = "start" | "end" | "range";

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const viewSpan = (view: ClipView) => view.max - view.min;

/** A clip of the last few seconds, the moment people usually want to keep. */
export function initialClipRange(now: number, duration: number): ClipRange {
    const end = clamp(now, Math.min(MIN_CLIP_LENGTH, duration), duration);
    return { start: Math.max(0, end - DEFAULT_CLIP_LENGTH), end };
}

/** A window around the clip wide enough to show what comes before and after it. */
export function initialClipView({ start, end }: ClipRange, duration: number): ClipView {
    const span = Math.min(duration, Math.max(DEFAULT_VIEW_SPAN, (end - start) * 4));
    const min = clamp((start + end) / 2 - span / 2, 0, duration - span);
    return { min, max: min + span };
}

export const timeAt = (fraction: number, view: ClipView) => view.min + clamp(fraction, 0, 1) * viewSpan(view);

/** Position of `time` across the view, unclamped so times outside it fall outside 0–1. */
export const fractionOf = (time: number, view: ClipView) => (time - view.min) / viewSpan(view);

export function grabAt(x: number, width: number, range: ClipRange, view: ClipView): ClipGrab | null {
    const startDistance = Math.abs(x - fractionOf(range.start, view) * width);
    const endDistance = Math.abs(x - fractionOf(range.end, view) * width);
    if (Math.min(startDistance, endDistance) <= HANDLE_HIT_SLOP_PX) return startDistance < endDistance ? "start" : "end";
    const time = timeAt(x / width, view);
    return time > range.start && time < range.end ? "range" : null;
}

export function moveEdge(range: ClipRange, edge: "start" | "end", time: number, duration: number): ClipRange {
    return edge === "start"
        ? { ...range, start: clamp(time, 0, range.end - MIN_CLIP_LENGTH) }
        : { ...range, end: clamp(time, range.start + MIN_CLIP_LENGTH, duration) };
}

export function shiftRange(range: ClipRange, by: number, duration: number): ClipRange {
    const length = range.end - range.start;
    const start = clamp(range.start + by, 0, duration - length);
    return { start, end: start + length };
}

/** Zooms around `fraction` of the view, keeping the time under the cursor in place. */
export function zoomView(view: ClipView, fraction: number, zoomIn: boolean, duration: number): ClipView {
    const anchor = timeAt(fraction, view);
    const span = clamp(viewSpan(view) * (zoomIn ? 0.85 : 1.15), Math.min(MIN_VIEW_SPAN, duration), duration);
    const min = clamp(anchor - fraction * span, 0, duration - span);
    return { min, max: min + span };
}

export function panView(view: ClipView, by: number, duration: number): ClipView {
    const span = viewSpan(view);
    const min = clamp(view.min + by, 0, duration - span);
    return { min, max: min + span };
}

/** Scrolls the view just enough to keep `time` on screen. */
export function revealTime(view: ClipView, time: number, duration: number): ClipView {
    if (time < view.min) return panView(view, time - view.min, duration);
    if (time > view.max) return panView(view, time - view.max, duration);
    return view;
}
