<script lang="ts">
    import { pointerScrub, type ScrubPosition } from "../../common/controls/pointerScrub";
    import { formatTime } from "../../../lib/utils/time";
    import type { SeekPreview } from "../../../lib/media/preview/seekPreview";
    import type { Chapter } from "../../../pages/player/types";
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

    export let duration = 0;
    export let time = 0;
    export let chapters: Chapter[] = [];
    export let buffered: TimeRange[] = [];
    export let seekPreview: SeekPreview | null = null;
    export let disabled = false;
    export let visible = true;
    export let emphasized = false;
    export let onScrub: (time: number) => void;
    export let onCommit: (time: number) => void;

    const SEGMENT_GAP_PX = 3;

    let hovering = false;
    let dragging = false;
    let hoverTime = 0;
    let hoverX = 0;
    let hoverTop = 0;
    let previewFrame: ImageBitmap | null = null;
    let previewRequest = 0;
    let shownRequest = 0;

    $: segments = trackSegments(chapters, duration);
    $: cursor = timeToFraction(time, duration);
    $: bufferedBar = bufferedFractions(buffered, duration);
    $: active = hovering || dragging || emphasized;
    $: hoverChapter = chapters.find((chapter) => hoverTime >= chapter.startTime && hoverTime < chapter.endTime) ?? null;

    const forgetPreviewFrame = (_source: SeekPreview | null) => {
        previewFrame = null;
    };
    $: forgetPreviewFrame(seekPreview);

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

    const showFrame = (frame: ImageBitmap, request: number) => {
        previewFrame = frame;
        shownRequest = request;
    };

    /** Keeps the last frame up until a newer one decodes, so scrubbing never blanks the card. */
    const showPreview = (preview: SeekPreview, time: number) => {
        const request = ++previewRequest;
        const cached = preview.peek(time);
        if (cached) return showFrame(cached, request);
        void preview.frameAt(time).then((frame) => {
            if (frame && request > shownRequest && preview === seekPreview) showFrame(frame, request);
        });
    };

    const trackHover = ({ ratio, rect }: ScrubPosition) => {
        if (!hovering && !dragging) hoverTop = rect.top;
        hovering = true;
        hoverTime = fractionToTime(ratio, duration);
        hoverX = rect.left + ratio * rect.width;
        if (seekPreview) showPreview(seekPreview, hoverTime);
    };

    const scrubTo = ({ ratio }: ScrubPosition) => onScrub(fractionToTime(ratio, duration));
</script>

<div
    class="relative h-6 w-full touch-none select-none {disabled ? 'cursor-default' : 'cursor-pointer'}"
    role="slider"
    tabindex="-1"
    aria-label="Seek"
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
        frame={previewFrame}
        withImage={Boolean(seekPreview)}
    />
{/if}
