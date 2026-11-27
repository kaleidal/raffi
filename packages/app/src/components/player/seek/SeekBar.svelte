<script lang="ts">
    import { pointerScrub, type ScrubPosition } from "../../common/controls/pointerScrub";
    import { formatTime } from "../../../lib/utils/time";
    import type { SeekPreview } from "../../../lib/media/preview/seekPreview";
    import type { Chapter } from "../../../pages/player/types";
    import { restingPreviewFrame } from "./restingPreviewFrame.svelte";
    import SeekPreviewCard from "./SeekPreviewCard.svelte";
    import {
        KIND_COLORS,
        bufferedFractions,
        fillWithin,
        fractionToTime,
        timeToFraction,
        trackSegments,
        type TimeRange,
        type TrackSegment,
    } from "./seekTrack";

    let {
        duration = 0,
        time = 0,
        chapters = [],
        buffered = [],
        seekPreview = null,
        disabled = false,
        visible = true,
        emphasized = false,
        onScrub,
        onCommit,
        onExpand,
    }: {
        duration?: number;
        time?: number;
        chapters?: Chapter[];
        buffered?: TimeRange[];
        seekPreview?: SeekPreview | null;
        disabled?: boolean;
        visible?: boolean;
        emphasized?: boolean;
        onScrub: (time: number) => void;
        onCommit: (time: number) => void;
        /** Scrolling up over the bar asks to open a closer look around this time. */
        onExpand?: (time: number) => void;
    } = $props();

    const SEGMENT_GAP_PX = 3;

    let hovering = $state(false);
    let dragging = $state(false);
    let hoverTime = $state(0);
    let hoverX = $state(0);
    let hoverTop = $state(0);

    const segments = $derived(trackSegments(chapters, duration));
    const cursor = $derived(timeToFraction(time, duration));
    const bufferedBar = $derived(bufferedFractions(buffered, duration));
    const active = $derived(hovering || dragging || emphasized);
    const hoverChapter = $derived(
        chapters.find((chapter) => hoverTime >= chapter.startTime && hoverTime < chapter.endTime) ?? null,
    );
    const previewFrames = $derived(seekPreview && restingPreviewFrame(seekPreview));

    const segmentStyle = (segment: TrackSegment) => {
        const leftGap = segment.isFirst ? 0 : SEGMENT_GAP_PX / 2;
        const rightGap = segment.isLast ? 0 : SEGMENT_GAP_PX / 2;
        const color = segment.kind ? KIND_COLORS[segment.kind] : undefined;
        return [
            `left:calc(${segment.left * 100}% + ${leftGap}px)`,
            `width:calc(${(segment.right - segment.left) * 100}% - ${leftGap + rightGap}px)`,
            `background:${color ? `rgba(${color},0.4)` : "color-mix(in oklab, var(--raffi-ink) 20%, transparent)"}`,
        ].join(";");
    };

    const fillColor = (segment: TrackSegment) => {
        const color = segment.kind ? KIND_COLORS[segment.kind] : undefined;
        return color ? `rgb(${color})` : "var(--raffi-accent)";
    };

    const trackHover = ({ ratio, rect }: ScrubPosition) => {
        if (!hovering && !dragging) hoverTop = rect.top;
        hovering = true;
        hoverTime = fractionToTime(ratio, duration);
        hoverX = rect.left + ratio * rect.width;
        previewFrames?.show(hoverTime);
    };

    const scrubTo = ({ ratio }: ScrubPosition) => onScrub(fractionToTime(ratio, duration));

    function expand(event: WheelEvent) {
        if (!onExpand || event.deltaY >= 0 || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
        event.preventDefault();
        const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
        onExpand(fractionToTime((event.clientX - bounds.left) / bounds.width, duration));
    }
</script>

<div
    class="relative h-6 w-full touch-none select-none {disabled ? 'cursor-default' : 'cursor-pointer'}"
    role="slider"
    tabindex="-1"
    aria-label="Seek"
    onwheel={expand}
    aria-valuemin={0}
    aria-valuemax={duration}
    aria-valuenow={time}
    aria-valuetext={formatTime(time)}
    use:pointerScrub={{
        disabled: disabled || duration <= 0,
        onHover: trackHover,
        onLeave: () => (hovering = false),
        onStart: (position) => {
            dragging = true;
            trackHover(position);
            scrubTo(position);
        },
        onMove: scrubTo,
        onEnd: (position) => {
            dragging = false;
            onCommit(fractionToTime(position.ratio, duration));
        },
    }}
>
    <div
        class="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 transition-[height] duration-150 ease-out {active
            ? 'h-2'
            : 'h-1'}"
    >
        {#each segments as segment (`${segment.left}-${segment.right}`)}
            <div class="absolute inset-y-0 overflow-hidden rounded-full" style={segmentStyle(segment)}>
                {#each bufferedBar as [from, to]}
                    {@const fill = fillWithin(segment, from, to)}
                    {#if fill}
                        <div
                            class="absolute inset-y-0 bg-ink/20"
                            style={`left:${fill.left * 100}%;width:${fill.width * 100}%`}
                        ></div>
                    {/if}
                {/each}
                <div
                    class="absolute inset-0 origin-left {dragging ? '' : 'transition-transform duration-200 ease-linear'}"
                    style={`transform:scaleX(${fillWithin(segment, 0, cursor)?.width ?? 0});background:${fillColor(segment)}`}
                ></div>
            </div>
        {/each}
    </div>

    <div
        class="pointer-events-none absolute top-1/2 size-3.5 rounded-full bg-accent shadow-[0_1px_6px_rgba(0,0,0,0.35)] {active
            ? 'scale-100'
            : 'scale-0'}"
        style={`left:${cursor * 100}%;translate:-50% -50%;transition:scale 150ms ease-out, left ${dragging ? 0 : 200}ms linear`}
    ></div>
</div>

{#if visible && (hovering || dragging) && duration > 0}
    <SeekPreviewCard
        anchorX={hoverX}
        anchorTop={hoverTop}
        time={hoverTime}
        chapterTitle={hoverChapter?.title ?? null}
        frame={previewFrames?.frame ?? null}
        withImage={Boolean(seekPreview)}
    />
{/if}
