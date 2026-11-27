const MIN_VIEW_SPAN = 5;

/** The stretch of the video a zoomable timeline shows, in seconds. */
export type TimelineView = { min: number; max: number };

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const viewSpan = (view: TimelineView) => view.max - view.min;

/** A window of `span` seconds centred on `time`, kept inside the video. */
export function viewAround(time: number, span: number, duration: number): TimelineView {
    const width = Math.min(duration, span);
    const min = clamp(time - width / 2, 0, duration - width);
    return { min, max: min + width };
}

export const timeAt = (fraction: number, view: TimelineView) => view.min + clamp(fraction, 0, 1) * viewSpan(view);

/** Position of `time` across the view, unclamped so times outside it fall outside 0–1. */
export const fractionOf = (time: number, view: TimelineView) => (time - view.min) / viewSpan(view);

/** Zooms around `fraction` of the view, keeping the time under the cursor in place. */
export function zoomView(view: TimelineView, fraction: number, zoomIn: boolean, duration: number): TimelineView {
    const anchor = timeAt(fraction, view);
    const span = clamp(viewSpan(view) * (zoomIn ? 0.85 : 1.15), Math.min(MIN_VIEW_SPAN, duration), duration);
    const min = clamp(anchor - fraction * span, 0, duration - span);
    return { min, max: min + span };
}

export function panView(view: TimelineView, by: number, duration: number): TimelineView {
    const span = viewSpan(view);
    const min = clamp(view.min + by, 0, duration - span);
    return { min, max: min + span };
}

/** Scrolls the view just enough to keep `time` on screen. */
export function revealTime(view: TimelineView, time: number, duration: number): TimelineView {
    if (time < view.min) return panView(view, time - view.min, duration);
    if (time > view.max) return panView(view, time - view.max, duration);
    return view;
}

/** The view after a wheel turn over `bounds`: turning it zooms around the pointer, swiping sideways pans. */
export function viewAfterWheel(view: TimelineView, event: WheelEvent, bounds: DOMRect, duration: number): TimelineView {
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.shiftKey) {
        const delta = event.deltaX || event.deltaY;
        return panView(view, (delta / bounds.width) * viewSpan(view), duration);
    }
    return zoomView(view, (event.clientX - bounds.left) / bounds.width, event.deltaY < 0, duration);
}
