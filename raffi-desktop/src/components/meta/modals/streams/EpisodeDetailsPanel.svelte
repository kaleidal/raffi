<script lang="ts">
    import { onDestroy, onMount, tick } from "svelte";
    import type { ShowResponse } from "../../../../lib/library/types/meta_types";
    import type { EpisodeProgressDetails, ReleaseInfo } from "./types";

    export let selectedEpisode: any = null;
    export let metaData: ShowResponse | null = null;
    export let releaseInfo: ReleaseInfo = { absolute: null, relative: null };
    export let progressDetails: EpisodeProgressDetails | null = null;

    let thumbnailError = false;
    let lastThumbnail: string | null = null;
    let descriptionContainer: HTMLDivElement | null = null;
    let descriptionText: HTMLParagraphElement | null = null;
    let descriptionIsClipped = false;
    let resizeObserver: ResizeObserver | null = null;

    $: episodeTitle =
        selectedEpisode?.name || selectedEpisode?.title || metaData?.meta?.name || "Episode details";

    $: episodeSeasonNumber = selectedEpisode ? `${selectedEpisode.season ?? "?"}` : null;
    $: episodeNumber = selectedEpisode
        ? `${selectedEpisode.episode ?? selectedEpisode.number ?? "?"}`
        : null;

    $: showEpisodeLabel =
        metaData?.meta?.type !== "movie" && episodeSeasonNumber && episodeNumber;

    $: detailsThumbnail =
        selectedEpisode?.thumbnail ||
        metaData?.meta?.background ||
        metaData?.meta?.poster ||
        null;

    $: episodeDescription =
        selectedEpisode?.description ||
        selectedEpisode?.overview ||
        metaData?.meta?.description ||
        null;

    $: if (detailsThumbnail !== lastThumbnail) {
        thumbnailError = false;
        lastThumbnail = detailsThumbnail ?? null;
    }

    async function updateDescriptionClipState() {
        await tick();
        if (!descriptionContainer || !descriptionText || !episodeDescription) {
            descriptionIsClipped = false;
            return;
        }

        descriptionIsClipped = descriptionText.scrollHeight - descriptionContainer.clientHeight > 1;
    }

    onMount(() => {
        resizeObserver = new ResizeObserver(() => {
            updateDescriptionClipState();
        });

        if (descriptionContainer) {
            resizeObserver.observe(descriptionContainer);
        }

        if (descriptionText) {
            resizeObserver.observe(descriptionText);
        }

        updateDescriptionClipState();
    });

    onDestroy(() => {
        resizeObserver?.disconnect();
    });

    $: episodeDescription, updateDescriptionClipState();
</script>

<aside
    class="w-full h-full min-h-0 rounded-[28px] bg-white/10 backdrop-blur-3xl p-5 lg:p-6 flex flex-col gap-4 overflow-hidden"
>
    {#if selectedEpisode}
        <div class="flex flex-1 min-h-0 flex-col gap-4 min-w-0 overflow-hidden">
            <div
                class="relative w-full aspect-video rounded-2xl overflow-hidden bg-white/6"
            >
                {#if detailsThumbnail && !thumbnailError}
                    <img
                        src={detailsThumbnail}
                        alt="Episode artwork"
                        class="w-full h-full object-cover"
                        on:error={() => (thumbnailError = true)}
                    />
                {:else}
                    <div class="w-full h-full flex items-center justify-center text-white/40 text-sm">
                        No artwork available
                    </div>
                {/if}

                {#if progressDetails}
                    <div
                        class="absolute bottom-0 left-0 w-full p-3 bg-linear-to-t from-black/80 via-black/40 to-transparent flex flex-col gap-1.5 z-10"
                    >
                        <div class="flex items-center justify-between text-[11px] text-white/72">
                            <span>Resume</span>
                            <span>{progressDetails.timeLeftLabel}</span>
                        </div>
                        <div class="h-1.5 bg-white/20 rounded-full overflow-hidden">
                            <div
                                class="h-full bg-white rounded-full"
                                style={`width: ${progressDetails.percent}%`}
                            ></div>
                        </div>
                    </div>
                {/if}
            </div>

            <div class="flex flex-col gap-3 min-w-0">
                {#if showEpisodeLabel}
                    <span class="text-sm text-white/50">
                        Season {episodeSeasonNumber} / Episode {episodeNumber}
                    </span>
                {/if}
                <h3 class="text-white text-2xl font-semibold leading-tight">{episodeTitle}</h3>
            </div>

            <div class="min-h-0 flex flex-1 flex-col gap-3 overflow-hidden">
                {#if releaseInfo.absolute}
                    <div class="pt-2 flex flex-col gap-1 flex-none">
                        <span class="text-xs text-white/45">Released</span>
                        <span class="text-white text-sm">
                            {releaseInfo.absolute}
                            {#if releaseInfo.relative}
                                <span class="text-white/50">({releaseInfo.relative})</span>
                            {/if}
                        </span>
                    </div>
                {/if}

                {#if episodeDescription}
                    <div class="min-h-0 overflow-y-auto pr-1" bind:this={descriptionContainer}>
                        <p
                            bind:this={descriptionText}
                            class="text-sm leading-6 text-white/58 {descriptionIsClipped
                                ? 'mask-[linear-gradient(to_bottom,black_0%,black_74%,transparent_100%)]'
                                : ''}"
                        >
                            {episodeDescription}
                        </p>
                    </div>
                {/if}
            </div>
        </div>
    {:else}
        <div class="flex flex-col items-center justify-center text-center text-white/60 text-sm h-full">
            Select an episode to view details.
        </div>
    {/if}
</aside>
