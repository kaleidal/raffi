<script lang="ts">
    import { portal } from "../../common/portal";
    import { lockPageScroll } from "../../common/scrollLock";
    import ChipRail from "../../common/ChipRail.svelte";
    import { fade, fly } from "svelte/transition";
    import { Play, X } from "@lucide/svelte";
    import { failedStreamKeys, streamFailureMessage } from "../../../pages/meta/metaState";
    import type { Addon } from "../../../lib/db/db";
    import type { ShowResponse } from "../../../lib/library/types/meta_types";
    import type { ProgressItem, ProgressMap, Stream } from "../../../pages/meta/types";
    import { allowTorrenting, isTorrentSource } from "../../../lib/stores/torrenting";
    import EpisodeHeader from "./streams/EpisodeHeader.svelte";
    import StreamsToolbar from "./streams/StreamsToolbar.svelte";
    import StreamsList from "./streams/StreamsList.svelte";
    import {
        getAudioLanguageFilterOptions,
        getAvailableStreamFilterOptions,
        getFilteredAddons,
        splitStreamsBySource,
        STREAM_SORT_OPTIONS,
        applyStreamFilters,
        buildEnrichedStreams,
    } from "./streams/streamFilters";
    import { computeProgressDetails, getProgressEntry, getReleaseInfo } from "./streams/episodeDetails";
    import type {
        EpisodeProgressDetails,
        EnrichedStream,
        ResolutionFilter,
        StreamSortOption,
        VideoCodecFilter,
        DynamicRangeFilter,
        AvailabilityFilter,
        SizeFilter,
    } from "./streams/types";

    export let streamsPopupVisible = false;
    export let addons: Addon[] = [];
    export let selectedAddon: string;
    export let loadingStreams = false;
    export let streams: any[] = [];
    export let metaData: ShowResponse | null = null;
    export let selectedEpisode: any = null;
    export let progressMap: ProgressMap | null = null;
    export let progressSignature: string | number | null = null;

    export let onClose: () => void = () => {};
    export let onStreamClick: (stream: any) => void = () => {};


    let resolutionFilter: ResolutionFilter = "all";
    let audioLanguageFilter = "all";
    let sortOption: StreamSortOption = "recommended";
    let filtersCollapsed = true;
    let videoCodecFilter: VideoCodecFilter = "all";
    let dynamicRangeFilter: DynamicRangeFilter = "all";
    let availabilityFilter: AvailabilityFilter = "all";
    let sizeFilter: SizeFilter = "all";
    let wasOpen = false;

    let episodeProgressEntry: ProgressItem | null = null;
    let progressDetails: EpisodeProgressDetails | null = null;

    function resetFilters() {
        resolutionFilter = "all";
        audioLanguageFilter = "all";
        sortOption = "recommended";
        videoCodecFilter = "all";
        dynamicRangeFilter = "all";
        availabilityFilter = "all";
        sizeFilter = "all";
    }

    function setResolutionFilter(value: ResolutionFilter) {
        if (resolutionFilter === value) return;
        resolutionFilter = value;
    }

    function setAudioLanguageFilter(value: string) {
        if (audioLanguageFilter === value) return;
        audioLanguageFilter = value;
    }

    function setSortOption(value: StreamSortOption) {
        if (sortOption === value) return;
        sortOption = value;
    }

    function setVideoCodecFilter(value: VideoCodecFilter) {
        if (videoCodecFilter === value) return;
        videoCodecFilter = value;
    }

    function setDynamicRangeFilter(value: DynamicRangeFilter) {
        if (dynamicRangeFilter === value) return;
        dynamicRangeFilter = value;
    }

    function setAvailabilityFilter(value: AvailabilityFilter) {
        if (availabilityFilter === value) return;
        availabilityFilter = value;
    }

    function setSizeFilter(value: SizeFilter) {
        if (sizeFilter === value) return;
        sizeFilter = value;
    }

    function selectAddon(addon: Addon) {
        if (selectedAddon === addon.transport_url) return;
        selectedAddon = addon.transport_url;
    }

    function close() {
        streamsPopupVisible = false;
        onClose();
    }

    function handleStreamClick(item: EnrichedStream) {
        const stream: Stream = {
            ...item.stream,
            raffiAvailability: {
                cacheHint: item.meta.isCached,
                providerLabel: item.meta.debridServiceLabel,
                dashboardUrl: item.meta.debridDashboardUrl,
                expectedSizeBytes: item.meta.sizeInMb == null
                    ? null
                    : item.meta.sizeInMb * 1024 * 1024,
            },
        };
        onStreamClick(stream);
    }


    $: filterState = {
        resolutionFilter,
        audioLanguageFilter,
        sortOption,
        videoCodecFilter,
        dynamicRangeFilter,
        availabilityFilter,
        sizeFilter,
    };

    $: filteredAddons = getFilteredAddons(addons);
    $: visibleStreams = $allowTorrenting
        ? streams
        : streams.filter((stream) => !isTorrentSource(stream));
    $: enrichedStreams = buildEnrichedStreams(visibleStreams, $failedStreamKeys);
    $: audioLanguageFilterOptions = getAudioLanguageFilterOptions(enrichedStreams);
    $: availableFilterOptions = getAvailableStreamFilterOptions(enrichedStreams);
    $: if (audioLanguageFilter !== "all" && !audioLanguageFilterOptions.includes(audioLanguageFilter)) {
        audioLanguageFilter = "all";
    }
    $: if (!availableFilterOptions.resolutions.some((option) => option.value === resolutionFilter)) {
        resolutionFilter = "all";
    }
    $: if (!availableFilterOptions.codecs.some((option) => option.value === videoCodecFilter)) {
        videoCodecFilter = "all";
    }
    $: if (!availableFilterOptions.dynamicRanges.some((option) => option.value === dynamicRangeFilter)) {
        dynamicRangeFilter = "all";
    }
    $: if (!availableFilterOptions.availability.some((option) => option.value === availabilityFilter)) {
        availabilityFilter = "all";
    }
    $: if (!availableFilterOptions.sizes.some((option) => option.value === sizeFilter)) {
        sizeFilter = "all";
    }

    $: filteredStreams = applyStreamFilters(enrichedStreams, filterState);
    $: ({ localFilteredStreams, addonFilteredStreams } = splitStreamsBySource(filteredStreams));
    $: bestStream = filteredStreams.find((item) => !item.isFailed) ?? null;
    $: hasDirectStream = visibleStreams.some((stream) => stream?.raffiSource === "direct");
    $: showAddonSetupGuide =
        visibleStreams.length === 0 &&
        filteredAddons.length === 0 &&
        !$streamFailureMessage?.toLowerCase().includes("direct link");

    $: releaseInfo = getReleaseInfo(
        selectedEpisode?.released ||
            selectedEpisode?.firstAired ||
            metaData?.meta?.released ||
            null,
    );

    $: progressSignature;
    $: episodeProgressEntry = getProgressEntry(
        progressMap,
        streamsPopupVisible,
        selectedEpisode,
        metaData,
    );
    $: progressDetails = computeProgressDetails(episodeProgressEntry);

    $: if (streamsPopupVisible && !wasOpen) {
        filtersCollapsed = true;
        wasOpen = true;
    }

    $: if (!streamsPopupVisible && wasOpen) {
        wasOpen = false;
    }

</script>

{#if streamsPopupVisible}
    <div
        use:portal
        use:lockPageScroll
        class="fixed inset-0 z-50 bg-canvas/35"
        transition:fade={{ duration: 200 }}
        on:click|self={close}
        on:keydown={(e) => e.key === "Escape" && close()}
        role="presentation"
    >
        <div
            class="streams-sheet absolute inset-y-0 right-0 flex flex-col gap-5 overflow-hidden bg-raised/70 p-[clamp(20px,2vw,32px)] shadow-[0_0_120px_rgba(0,0,0,0.45)] backdrop-blur-[40px]"
            transition:fly={{ x: 60, duration: 260 }}
            role="dialog"
            aria-modal="true"
            aria-label="Choose a stream"
        >
            <div class="flex items-start justify-between gap-4">
                <EpisodeHeader {selectedEpisode} {metaData} {releaseInfo} {progressDetails} />
                <button
                    class="-mr-2 shrink-0 cursor-pointer rounded-full p-2 text-ink/50 transition-colors hover:bg-ink/8 hover:text-ink"
                    on:click={close}
                    aria-label="Close streams"
                >
                    <X size={24} strokeWidth={2} />
                </button>
            </div>

            {#if $streamFailureMessage}
                <p class="rounded-2xl bg-danger/14 px-4 py-3 text-sm text-danger">{$streamFailureMessage}</p>
            {/if}

            {#if bestStream && !loadingStreams}
                <button
                    data-tv-autofocus
                    class="flex w-full cursor-pointer items-center gap-4 rounded-full bg-accent px-6 py-3.5 text-left text-on-accent transition-colors hover:bg-accent/85"
                    on:click={() => bestStream && handleStreamClick(bestStream)}
                >
                    <Play size={22} strokeWidth={2.5} fill="currentColor" />
                    <span class="font-semibold">Play</span>
                    <span class="min-w-0 truncate text-sm opacity-70">
                        {[bestStream.meta.resolutionLabel, bestStream.meta.providerLabel].filter(Boolean).join(" · ")}
                    </span>
                </button>
            {/if}

            {#if filteredAddons.length > 1 && !hasDirectStream}
                <ChipRail>
                    {#each filteredAddons as addon (addon.transport_url)}
                        <button
                            type="button"
                            class="shrink-0 cursor-pointer rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors {selectedAddon === addon.transport_url
                                ? 'bg-accent text-on-accent'
                                : 'bg-ink/8 text-ink/75 hover:bg-ink/14 hover:text-ink'}"
                            on:click={() => selectAddon(addon)}
                        >
                            {addon.manifest.name}
                        </button>
                    {/each}
                </ChipRail>
            {/if}

            {#if !loadingStreams && streams.length > 0}
                <StreamsToolbar
                    {filtersCollapsed}
                    filteredCount={filteredStreams.length}
                    totalCount={streams.length}
                    {resolutionFilter}
                    {audioLanguageFilter}
                    {videoCodecFilter}
                    {dynamicRangeFilter}
                    {availabilityFilter}
                    {sizeFilter}
                    {sortOption}
                    {audioLanguageFilterOptions}
                    resolutionFilters={availableFilterOptions.resolutions}
                    videoCodecFilters={availableFilterOptions.codecs}
                    dynamicRangeFilters={availableFilterOptions.dynamicRanges}
                    availabilityFilters={availableFilterOptions.availability}
                    sizeFilters={availableFilterOptions.sizes}
                    sortOptions={STREAM_SORT_OPTIONS}
                    onToggleFiltersCollapsed={() => (filtersCollapsed = !filtersCollapsed)}
                    onSetResolutionFilter={setResolutionFilter}
                    onSetAudioLanguageFilter={setAudioLanguageFilter}
                    onSetVideoCodecFilter={setVideoCodecFilter}
                    onSetDynamicRangeFilter={setDynamicRangeFilter}
                    onSetAvailabilityFilter={setAvailabilityFilter}
                    onSetSizeFilter={setSizeFilter}
                    onSetSortOption={setSortOption}
                    onResetFilters={resetFilters}
                />
            {/if}

            <StreamsList
                {loadingStreams}
                {streams}
                {filteredStreams}
                {localFilteredStreams}
                {addonFilteredStreams}
                {showAddonSetupGuide}
                onStreamClick={handleStreamClick}
            />
        </div>
    </div>
{/if}

<style>
    .streams-sheet {
        width: min(720px, 100vw);
        border-radius: 36px 0 0 36px;
    }

    @media (orientation: portrait) {
        .streams-sheet {
            border-radius: 0;
        }
    }
</style>
