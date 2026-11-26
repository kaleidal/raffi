<script lang="ts">
    import { untrack } from "svelte";
    import { pointerScrub, type ScrubPosition } from "../../common/controls/pointerScrub";
    import type { SeekPreview } from "../../../lib/media/preview/seekPreview";
    import { latestPreviewFrame } from "../seek/latestPreviewFrame.svelte";
    import SeekPreviewCard from "../seek/SeekPreviewCard.svelte";
    import ClipFilmstrip from "./ClipFilmstrip.svelte";
    import {
        clamp,
        fractionOf,
        grabAt,
        initialClipView,
        moveEdge,
        panView,
        revealTime,
        shiftRange,
        timeAt,
        zoomView,
        type ClipGrab,
        type ClipRange,
    } from "./clipTimeline";

    let {
        range = $bindable(),
        duration,
        playhead,
        preview,
        onSettle,
    }: {
        range: ClipRange;
        duration: number;
        playhead: number;
        preview: SeekPreview | null;
        /** Called with the time to show once an edge or the whole clip is let go. */
        onSettle: (time: number) => void;
    } = $props();

    const KEY_STEP = 0.5;
    const KEY_STEP_LARGE = 5;
    const EDGE_PAN_FRACTION = 0.03;

    let view = $state(untrack(() => initialClipView(range, duration)));
    let grab = $state<ClipGrab | null>(null);
    let hoverGrab = $state<ClipGrab | null>(null);
    let grabOffset = 0;
    let anchor = $state({ x: 0, top: 0 });

    const frames = $derived(preview && latestPreviewFrame(preview));
    const percent = (time: number) => clamp(fractionOf(time, view), 0, 1) * 100;
    const startPercent = $derived(percent(range.start));
    const endPercent = $derived(percent(range.end));
    const edgeTime = $derived(grab === "end" ? range.end : range.start);

    function follow(position: ScrubPosition) {
        anchor = { x: position.rect.left + fractionOf(edgeTime, view) * position.rect.width, top: position.rect.top };
        frames?.show(edgeTime);
    }

    function onStart(position: ScrubPosition) {
        const time = timeAt(position.ratio, view);
        grab = grabAt(position.ratio * position.rect.width, position.rect.width, range, view);
        if (!grab) {
            grab = time < range.start ? "start" : "end";
            range = moveEdge(range, grab, time, duration);
        }
        grabOffset = time - range.start;
        follow(position);
    }

    function onMove(position: ScrubPosition) {
        if (!grab) return;
        if (position.ratio <= 0 || position.ratio >= 1) {
            const direction = position.ratio <= 0 ? -1 : 1;
            view = panView(view, direction * (view.max - view.min) * EDGE_PAN_FRACTION, duration);
        }
        const time = timeAt(position.ratio, view);
        range = grab === "range" ? shiftRange(range, time - grabOffset - range.start, duration) : moveEdge(range, grab, time, duration);
        follow(position);
    }

    function onEnd() {
        if (!grab) return;
        onSettle(edgeTime);
        grab = null;
    }

    function onHover(position: ScrubPosition) {
        hoverGrab = grabAt(position.ratio * position.rect.width, position.rect.width, range, view);
    }

    function onWheel(event: WheelEvent) {
        event.preventDefault();
        const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
        if (Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.shiftKey) {
            const delta = event.deltaX || event.deltaY;
            view = panView(view, (delta / bounds.width) * (view.max - view.min), duration);
            return;
        }
        view = zoomView(view, (event.clientX - bounds.left) / bounds.width, event.deltaY < 0, duration);
    }

    function nudge(edge: "start" | "end", event: KeyboardEvent) {
        const direction = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
        if (!direction) return;
        event.preventDefault();
        const time = (edge === "start" ? range.start : range.end) + direction * (event.shiftKey ? KEY_STEP_LARGE : KEY_STEP);
        range = moveEdge(range, edge, time, duration);
        view = revealTime(view, edge === "start" ? range.start : range.end, duration);
        onSettle(edge === "start" ? range.start : range.end);
    }

    const cursor = $derived(
        grab === "range" ? "grabbing" : grab || hoverGrab === "start" || hoverGrab === "end" ? "ew-resize" : hoverGrab ? "grab" : "pointer",
    );
</script>

<div
    class="timeline relative w-full touch-none select-none"
    style:cursor
    use:pointerScrub={{ onStart, onMove, onEnd, onHover, onLeave: () => (hoverGrab = null) }}
    onwheel={onWheel}
>
    <ClipFilmstrip {preview} {view} />
    <div class="absolute inset-y-0 left-0 rounded-l-[inherit] bg-canvas/65" style:width="{startPercent}%"></div>
    <div class="absolute inset-y-0 right-0 rounded-r-[inherit] bg-canvas/65" style:width="{100 - endPercent}%"></div>

    <div
        class="selection pointer-events-none absolute inset-y-0"
        style:left="{startPercent}%"
        style:right="{100 - endPercent}%"
    >
        <div class="absolute inset-0 border-y-[3px] border-accent"></div>
        <button
            class="handle handle--start pointer-events-auto"
            role="slider"
            aria-label="Clip start"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={range.start}
            onkeydown={(event) => nudge("start", event)}
        >
            <span class="grip"></span>
        </button>
        <button
            class="handle handle--end pointer-events-auto"
            role="slider"
            aria-label="Clip end"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={range.end}
            onkeydown={(event) => nudge("end", event)}
        >
            <span class="grip"></span>
        </button>
    </div>

    {#if playhead >= view.min && playhead <= view.max}
        <div
            class="pointer-events-none absolute -inset-y-1.5 w-[3px] -translate-x-1/2 rounded-full bg-ink shadow-[0_0_8px_rgba(0,0,0,0.5)]"
            style:left="{fractionOf(playhead, view) * 100}%"
        ></div>
    {/if}
</div>

{#if grab && grab !== "range"}
    <SeekPreviewCard anchorX={anchor.x} anchorTop={anchor.top} time={edgeTime} frame={frames?.frame ?? null} withImage={Boolean(preview)} />
{/if}

<style>
    .timeline {
        height: clamp(52px, 4.4vw, 76px);
        border-radius: 14px;
    }

    .handle {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--raffi-accent);
        cursor: ew-resize;
    }

    .handle--start {
        right: 100%;
        border-radius: 14px 0 0 14px;
    }

    .handle--end {
        left: 100%;
        border-radius: 0 14px 14px 0;
    }

    .handle:focus-visible {
        outline: 2px solid var(--raffi-ink);
        outline-offset: 2px;
    }

    .grip {
        width: 3px;
        height: 40%;
        border-radius: 999px;
        background: color-mix(in oklab, var(--raffi-on-accent) 70%, transparent);
    }
</style>
