<script lang="ts">
    import { untrack } from "svelte";
    import { fly } from "svelte/transition";
    import type { SeekPreview } from "../../../lib/media/preview/seekPreview";
    import { formatTime } from "../../../lib/utils/time";
    import Filmstrip from "./Filmstrip.svelte";
    import { clamp, fractionOf, timeAt, viewAfterWheel, viewAround, viewSpan } from "./timelineView";

    let {
        duration,
        time,
        center,
        preview,
        onSeek,
        onClose,
    }: {
        duration: number;
        time: number;
        /** Where the pointer was on the seek bar when the strip opened. */
        center: number;
        preview: SeekPreview | null;
        onSeek: (time: number) => void;
        onClose: () => void;
    } = $props();

    const OPEN_SPAN_SECONDS = 120;
    const LEAVE_GRACE_MS = 500;

    const openSpan = untrack(() => Math.min(OPEN_SPAN_SECONDS, duration));
    let view = $state(untrack(() => viewAround(center, openSpan, duration)));
    let pointer = $state<number | null>(null);
    let strip = $state<HTMLDivElement>();
    let leaving: ReturnType<typeof setTimeout> | undefined;

    const hoverTime = $derived(pointer === null ? null : timeAt(pointer, view));
    const playhead = $derived(fractionOf(time, view));

    function track(event: PointerEvent | WheelEvent) {
        const bounds = strip!.getBoundingClientRect();
        pointer = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
    }

    function onWheel(event: WheelEvent) {
        event.preventDefault();
        const zoomingOut = Math.abs(event.deltaY) >= Math.abs(event.deltaX) && !event.shiftKey && event.deltaY > 0;
        if (zoomingOut && viewSpan(view) >= openSpan) return onClose();
        view = viewAfterWheel(view, event, strip!.getBoundingClientRect(), duration);
        track(event);
    }

    function onEnter() {
        clearTimeout(leaving);
    }

    function onLeave() {
        pointer = null;
        leaving = setTimeout(onClose, LEAVE_GRACE_MS);
    }

    function seek(event: MouseEvent) {
        const bounds = strip!.getBoundingClientRect();
        onSeek(timeAt((event.clientX - bounds.left) / bounds.width, view));
        onClose();
    }

    function closeOnEscape(event: KeyboardEvent) {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
    }

    $effect(() => () => clearTimeout(leaving));
</script>

<svelte:window onkeydowncapture={closeOnEscape} />

<div class="flex w-full flex-col gap-1.5" in:fly={{ y: 12, duration: 180 }}>
    <div
        bind:this={strip}
        class="strip relative w-full cursor-pointer touch-none select-none"
        role="slider"
        tabindex="-1"
        aria-label="Seek by frame"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={time}
        onwheel={onWheel}
        onpointermove={track}
        onpointerenter={onEnter}
        onpointerleave={onLeave}
        onclick={seek}
        onkeydown={closeOnEscape}
    >
        <Filmstrip {preview} {view} />
        {#if playhead >= 0 && playhead <= 1}
            <div
                class="pointer-events-none absolute -inset-y-1 w-[3px] -translate-x-1/2 rounded-full bg-accent shadow-[0_0_8px_rgba(0,0,0,0.5)]"
                style:left="{playhead * 100}%"
            ></div>
        {/if}
        {#if pointer !== null && hoverTime !== null}
            <div class="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-ink" style:left="{pointer * 100}%">
                <span
                    class="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-full bg-black/70 px-2.5 py-1 text-xs font-medium whitespace-nowrap text-ink tabular-nums backdrop-blur-md"
                >
                    {formatTime(hoverTime)}
                </span>
            </div>
        {/if}
    </div>
    <div class="flex justify-between text-xs text-ink/50 tabular-nums">
        <span>{formatTime(view.min)}</span>
        <span>{formatTime(view.max)}</span>
    </div>
</div>

<style>
    .strip {
        height: clamp(56px, 4.6vw, 88px);
        border-radius: 14px;
    }
</style>
