<script lang="ts">
    import { onDestroy } from "svelte";
    import SeekBar from "../../../components/player/seek/SeekBar.svelte";
    import type { TimeRange } from "../../../components/player/seek/seekTrack";
    import { claimKeys } from "../../../lib/tv/keyClaims";
    import { formatTime } from "../../../lib/utils/time";
    import type { Chapter } from "../types";

    export let time = 0;
    export let duration = 0;
    export let buffered: TimeRange[] = [];
    export let chapters: Chapter[] = [];
    export let inverted = false;
    export let element: HTMLDivElement | null = null;
    export let onCommit: (time: number) => void;
    /** The time being scrubbed to, or null once the scrub is committed. */
    export let onScrub: (time: number | null) => void = () => {};

    const STEP_SECONDS = 10;
    const MAX_STEP_MULTIPLIER = 6;
    const PRESSES_PER_SPEEDUP = 4;
    const COMMIT_DELAY_MS = 700;

    let scrubTime: number | null = null;
    let presses = 0;
    let focused = false;
    let commitTimer: ReturnType<typeof setTimeout> | null = null;
    let releaseKeys: (() => void) | null = null;

    $: shownTime = scrubTime ?? time;

    function commit() {
        if (commitTimer) clearTimeout(commitTimer);
        commitTimer = null;
        if (scrubTime === null) return;
        onCommit(scrubTime);
        scrubTime = null;
        presses = 0;
        onScrub(null);
    }

    /** Moves the knob one step left or right, speeding up while the button is held. */
    export function nudge(rightward: boolean) {
        const forward = inverted ? !rightward : rightward;
        const multiplier = Math.min(MAX_STEP_MULTIPLIER, 1 + Math.floor(presses / PRESSES_PER_SPEEDUP));
        presses += 1;
        const target = (scrubTime ?? time) + (forward ? 1 : -1) * STEP_SECONDS * multiplier;
        scrubTime = Math.max(0, Math.min(duration, target));
        onScrub(scrubTime);
        if (commitTimer) clearTimeout(commitTimer);
        commitTimer = setTimeout(commit, COMMIT_DELAY_MS);
    }

    function claimKey(event: KeyboardEvent) {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            nudge(event.key === "ArrowRight");
            return true;
        }
        if (event.key === "Enter") {
            commit();
            return true;
        }
        return false;
    }

    function handleFocus() {
        focused = true;
        releaseKeys = claimKeys(claimKey);
    }

    function handleBlur() {
        focused = false;
        releaseKeys?.();
        releaseKeys = null;
        commit();
    }

    onDestroy(() => releaseKeys?.());
</script>

<div
    bind:this={element}
    class="rounded-full"
    role="slider"
    tabindex="0"
    aria-label="Seek"
    aria-valuemin={0}
    aria-valuemax={duration}
    aria-valuenow={shownTime}
    aria-valuetext={formatTime(shownTime)}
    data-own-focus
    on:focus={handleFocus}
    on:blur={handleBlur}
>
    <SeekBar
        {duration}
        time={shownTime}
        {inverted}
        {chapters}
        {buffered}
        disabled
        visible={false}
        emphasized={focused}
        onScrub={() => {}}
        onCommit={() => {}}
    />
</div>
