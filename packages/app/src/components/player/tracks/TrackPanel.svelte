<script lang="ts">
    import { onMount, untrack } from "svelte";
    import { fly } from "svelte/transition";
    import { ChevronDown } from "@lucide/svelte";
    import SubtitleToolbar from "./SubtitleToolbar.svelte";
    import TrackRow from "./TrackRow.svelte";
    import { isOff, subtitleLanguages, trackLanguage, variantLabel } from "./trackGroups";
    import { TRACK_PANEL_ID, type TrackOptions } from "./types";

    let { options, onClose }: { options: TrackOptions; onClose: () => void } = $props();

    let panel = $state<HTMLDivElement>();

    const off = $derived(options.subtitles.find(isOff));
    const addedFiles = $derived(options.subtitles.filter((track) => track.isLocal));
    const languages = $derived(subtitleLanguages(options.subtitles));
    let openLanguage = $state(
        untrack(() => {
            const selected = options.subtitles.find((track) => track.selected && !isOff(track) && !track.isLocal);
            return selected ? trackLanguage(selected) : null;
        }),
    );

    onMount(() => panel?.querySelector<HTMLElement>("[aria-pressed='true']")?.focus({ preventScroll: true }));

    function closeOnOutside(event: PointerEvent) {
        const target = event.target as Element;
        if (panel?.contains(target) || target.closest(`[aria-controls="${TRACK_PANEL_ID}"]`)) return;
        onClose();
    }

    function closeOnEscape(event: KeyboardEvent) {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
    }
</script>

<svelte:window onpointerdowncapture={closeOnOutside} onkeydowncapture={closeOnEscape} />

<div
    id={TRACK_PANEL_ID}
    bind:this={panel}
    class="track-panel flex overflow-hidden {options.audio.length ? 'with-audio' : ''} rounded-[26px] bg-raised/85 text-ink shadow-[0_30px_90px_rgba(0,0,0,0.5)] backdrop-blur-2xl"
    role="dialog"
    aria-label="Audio and subtitles"
    transition:fly={{ y: 10, duration: 180 }}
>
    {#if options.audio.length}
        <section class="audio flex min-h-0 flex-col bg-ink/3">
            <h2 class="heading">Audio</h2>
            <div class="list">
                {#each options.audio as track}
                    <TrackRow stacked label={track.label} detail={track.detail} selected={track.selected} onclick={() => options.onSelectAudio(track)} />
                {/each}
            </div>
        </section>
    {/if}

    <section class="flex min-h-0 min-w-0 flex-1 flex-col">
        <h2 class="heading">Subtitles</h2>
        <div class="list">
            {#if off}
                <TrackRow label="Off" selected={off.selected} onclick={() => options.onSelectSubtitle(off)} />
            {/if}
            {#each addedFiles as track}
                <TrackRow label={track.label} detail="Your file" selected={track.selected} onclick={() => options.onSelectSubtitle(track)} />
            {/each}
            {#each languages as language (language.name)}
                {#if language.tracks.length === 1}
                    {@const track = language.tracks[0]}
                    <TrackRow
                        label={language.name}
                        detail={track.detail || track.label}
                        selected={track.selected}
                        onclick={() => options.onSelectSubtitle(track)}
                    />
                {:else}
                    {@const open = openLanguage === language.name}
                    <TrackRow
                        label={language.name}
                        selected={!open && language.tracks.some((track) => track.selected)}
                        expanded={open}
                        onclick={() => (openLanguage = open ? null : language.name)}
                    >
                        {#snippet trailing()}
                            <span class="text-[0.85em] text-ink/45 tabular-nums">{language.tracks.length}</span>
                            <ChevronDown size={16} strokeWidth={2.25} class="text-ink/45 transition-transform {open ? 'rotate-180' : ''}" />
                        {/snippet}
                    </TrackRow>
                    {#if open}
                        {#each language.tracks as track}
                            <TrackRow
                                nested
                                label={variantLabel(track, language.tracks)}
                                detail={track.detail}
                                selected={track.selected}
                                onclick={() => options.onSelectSubtitle(track)}
                            />
                        {/each}
                    {/if}
                {/if}
            {/each}
        </div>
        {#if options.subtitleTools}
            <SubtitleToolbar tools={options.subtitleTools} />
        {/if}
    </section>
</div>

<style>
    .track-panel {
        width: min(440px, calc(100vw - 32px));
        max-height: min(60vh, 520px);
    }

    .track-panel.with-audio {
        width: min(700px, calc(100vw - 32px));
    }

    .audio {
        width: 40%;
    }

    .heading {
        padding: 18px 20px 8px;
        font-size: clamp(15px, 1vw, 17px);
        font-weight: 600;
    }

    .list {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 0 8px 10px;
        scrollbar-width: thin;
    }
</style>
