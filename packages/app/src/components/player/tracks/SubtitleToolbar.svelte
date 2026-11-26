<script lang="ts">
    import { untrack } from "svelte";
    import { FilePlus, Minus, Plus } from "@lucide/svelte";
    import BusyIcon from "../../common/loading/BusyIcon.svelte";
    import type { SubtitleTools } from "./types";

    let { tools }: { tools: SubtitleTools } = $props();

    const STEP = 0.25;
    const LIMIT = 30;

    let delay = $state(untrack(() => tools.delay));
    let uploading = $state(false);
    let error = $state("");
    let fileInput = $state<HTMLInputElement>();

    const delayLabel = $derived(delay === 0 ? "0s" : `${delay > 0 ? "+" : "−"}${Math.abs(delay).toFixed(2)}s`);

    function setDelay(seconds: number) {
        delay = Math.max(-LIMIT, Math.min(LIMIT, Math.round(seconds * 100) / 100));
        tools.onDelayChange(delay);
    }

    async function upload() {
        const file = fileInput?.files?.[0];
        if (fileInput) fileInput.value = "";
        if (!file) return;
        error = "";
        uploading = true;
        try {
            await tools.onUpload(file);
        } catch (failure) {
            error = failure instanceof Error ? failure.message : "This file couldn't be read.";
        } finally {
            uploading = false;
        }
    }
</script>

<div class="toolbar flex flex-col gap-2 px-3 pt-1 pb-3">
    {#if error}
        <p class="px-2 text-[0.85em] text-danger">{error}</p>
    {/if}
    <div class="flex items-center justify-between gap-3">
        <input class="hidden" type="file" accept=".srt,.vtt,application/x-subrip,text/vtt" bind:this={fileInput} onchange={upload} />
        <button
            class="flex cursor-pointer items-center gap-2 rounded-full py-2 pr-3.5 pl-3 font-medium text-ink/72 transition-colors hover:bg-ink/8 hover:text-ink disabled:cursor-wait"
            disabled={uploading}
            onclick={() => fileInput?.click()}
        >
            <span class="size-[18px]">
                <BusyIcon busy={uploading} size="100%">
                    <FilePlus class="size-full" strokeWidth={2} />
                </BusyIcon>
            </span>
            Add file
        </button>

        <div class="flex items-center gap-1">
            <span class="mr-2 text-ink/50">Delay</span>
            <button class="step" aria-label="Show subtitles earlier" onclick={() => setDelay(delay - STEP)}>
                <Minus size={16} strokeWidth={2.25} />
            </button>
            <button
                class="min-w-[4.5em] cursor-pointer rounded-full px-1 py-1.5 text-center font-medium tabular-nums transition-colors {delay === 0
                    ? 'cursor-default text-ink/60'
                    : 'text-ink hover:bg-ink/8'}"
                aria-label="Reset delay"
                disabled={delay === 0}
                onclick={() => setDelay(0)}
            >
                {delayLabel}
            </button>
            <button class="step" aria-label="Show subtitles later" onclick={() => setDelay(delay + STEP)}>
                <Plus size={16} strokeWidth={2.25} />
            </button>
        </div>
    </div>
</div>

<style>
    .toolbar {
        font-size: clamp(13px, 0.9vw, 15px);
    }

    .step {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 999px;
        cursor: pointer;
        background: color-mix(in oklab, var(--raffi-ink) 8%, transparent);
        color: color-mix(in oklab, var(--raffi-ink) 80%, transparent);
        transition: background-color 150ms;
    }

    .step:hover {
        background: color-mix(in oklab, var(--raffi-ink) 14%, transparent);
    }
</style>
