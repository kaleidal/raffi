import { clamp, fractionOf, timeAt, viewAround, type TimelineView } from "../seek/timelineView";

export const MIN_CLIP_LENGTH = 0.5;
export const DEFAULT_CLIP_LENGTH = 20;

const HANDLE_HIT_SLOP_PX = 16;
const DEFAULT_VIEW_SPAN = 90;

export type ClipRange = { start: number; end: number };

export type ClipGrab = "start" | "end" | "range";

/** A clip of the last few seconds, the moment people usually want to keep. */
export function initialClipRange(now: number, duration: number): ClipRange {
    const end = clamp(now, Math.min(MIN_CLIP_LENGTH, duration), duration);
    return { start: Math.max(0, end - DEFAULT_CLIP_LENGTH), end };
}

/** A window around the clip wide enough to show what comes before and after it. */
export const initialClipView = ({ start, end }: ClipRange, duration: number): TimelineView =>
    viewAround((start + end) / 2, Math.max(DEFAULT_VIEW_SPAN, (end - start) * 4), duration);

export function grabAt(x: number, width: number, range: ClipRange, view: TimelineView): ClipGrab | null {
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
