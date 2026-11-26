<script lang="ts">
    import { onMount, untrack } from "svelte";
    import { Pause, Play, Scissors } from "@lucide/svelte";
    import BusyIcon from "../../common/loading/BusyIcon.svelte";
    import type { SeekPreview } from "../../../lib/media/preview/seekPreview";
    import { formatTime } from "../../../lib/utils/time";
    import PlayerButton from "../chrome/PlayerButton.svelte";
    import ClipTimeline from "./ClipTimeline.svelte";
    import { initialClipRange } from "./clipTimeline";
    import { saveClip } from "./saveClip";

    let {
        duration,
        currentTime,
        isPlaying,
        videoSrc,
        seekPreview,
        togglePlay,
        onSeekChange,
        onClose,
    }: {
        duration: number;
        currentTime: number;
        isPlaying: boolean;
        videoSrc: string | null;
        seekPreview: SeekPreview | null;
        togglePlay: () => void;
        onSeekChange: (time: number) => void;
        onClose: () => void;
    } = $props();

    /** How much of the end a moved end edge replays, so you see where the clip stops. */
    const END_LEAD_IN = 2;

    let range = $state(untrack(() => initialClipRange(currentTime, duration)));
    let looping = $state(false);
    let saving = $state(false);
    let status = $state<{ kind: "saved" | "error"; text: string } | null>(null);

    const length = $derived(range.end - range.start);
    const preciseTime = (time: number) => `${formatTime(time)}.${Math.floor((time % 1) * 10)}`;

    onMount(() => {
        if (isPlaying) togglePlay();
    });

    $effect(() => {
        if (looping && isPlaying && currentTime >= range.end) onSeekChange(range.start);
    });

    function togglePreview() {
        if (isPlaying) return togglePlay();
        if (currentTime < range.start || currentTime >= range.end - 0.1) onSeekChange(range.start);
        looping = true;
        togglePlay();
    }

    function settle(time: number) {
        status = null;
        onSeekChange(isPlaying && time === range.end ? Math.max(range.start, time - END_LEAD_IN) : time);
    }

    async function save() {
        if (!videoSrc || saving) return;
        status = null;
        saving = true;
        try {
            const saved = await saveClip(videoSrc, range);
            if (saved) status = { kind: "saved", text: `Saved as ${saved.split(/[\\/]/).pop()}` };
        } catch (error) {
            status = { kind: "error", text: error instanceof Error ? error.message : String(error) };
        } finally {
            saving = false;
        }
    }
</script>

<div class="flex w-full flex-col gap-[clamp(12px,1vw,18px)] px-4">
    <ClipTimeline bind:range {duration} playhead={currentTime} preview={seekPreview} onSettle={settle} />

    <div class="-mx-4 flex items-center justify-between gap-4">
        <div class="flex min-w-0 items-center gap-[clamp(8px,0.8vw,14px)]">
            <PlayerButton label={isPlaying ? "Pause" : "Play clip"} onclick={togglePreview}>
                {#if isPlaying}
                    <Pause strokeWidth={2} fill="currentColor" />
                {:else}
                    <Play strokeWidth={2} fill="currentColor" />
                {/if}
            </PlayerButton>
            <span class="clip-text font-medium whitespace-nowrap text-ink tabular-nums">
                {preciseTime(range.start)} – {preciseTime(range.end)}
            </span>
            <span class="clip-text whitespace-nowrap text-ink/55 tabular-nums">{length.toFixed(1)}s</span>
        </div>

        <div class="flex min-w-0 items-center gap-2">
            {#if status}
                <span class="clip-text mr-2 truncate {status.kind === 'error' ? 'text-danger' : 'text-ink/70'}">{status.text}</span>
            {/if}
            <button
                class="clip-text cursor-pointer rounded-full px-5 py-2.5 font-medium text-ink/80 transition-colors hover:bg-ink/12 hover:text-ink"
                onclick={onClose}
            >
                Done
            </button>
            <button
                class="clip-text flex cursor-pointer items-center gap-2 rounded-full bg-accent py-2.5 pr-5 pl-4 font-semibold text-on-accent transition-[background-color,scale] hover:bg-accent/88 active:scale-96 disabled:cursor-wait"
                disabled={saving || !videoSrc}
                onclick={save}
            >
                <span class="size-[1.15em]">
                    <BusyIcon busy={saving} size="100%">
                        <Scissors class="size-full" strokeWidth={2.25} />
                    </BusyIcon>
                </span>
                Save clip
            </button>
        </div>
    </div>
</div>

<style>
    .clip-text {
        font-size: clamp(13px, 0.95vw, 17px);
    }
</style>
