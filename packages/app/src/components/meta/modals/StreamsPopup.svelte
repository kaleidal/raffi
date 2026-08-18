<script lang="ts">
    import { fade } from "svelte/transition";
    import { X } from "@lucide/svelte";
    import { failedStreamKeys, streamFailureMessage } from "../../../pages/meta/metaState";
    import type { Addon } from "../../../lib/db/db";
    import type { ShowResponse } from "../../../lib/library/types/meta_types";
    import type { ProgressItem, ProgressMap, Stream } from "../../../pages/meta/types";
    import { allowTorrenting, isTorrentSource } from "../../../lib/stores/torrenting";
    import EpisodeDetailsPanel from "./streams/EpisodeDetailsPanel.svelte";
    import StreamsFiltersPanel from "./streams/StreamsFiltersPanel.svelte";
    import StreamsList from "./streams/StreamsList.svelte";
    import {
        getAudioLanguageFilterOptions,
        getAvailableStreamFilterOptions,
        getFilteredAddons,
        RESOLUTION_FILTERS,
        VIDEO_CODEC_FILTERS,
        DYNAMIC_RANGE_FILTERS,
        AVAILABILITY_FILTERS,
        SIZE_FILTERS,
        splitStreamsBySource,
        STREAM_SORT_OPTIONS,
        applyStreamFilters,
        areFiltersActive,
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
    export let onOpenAddons: () => void = () => {};

    export const portal = (node: HTMLElement) => {
        if (typeof document === "undefined") {
            return { destroy() {} };
        }
        document.body.appendChild(node);
        return {
            destroy() {
                if (node.parentNode) {
                    node.parentNode.removeChild(node);
                }
            },
        };
    };

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

    function handleOpenAddons() {
        onOpenAddons();
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
    $: filtersActive = areFiltersActive(filterState);
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
        class="raffi-modal-backdrop fixed inset-0 z-50 bg-[#0f0f0f]/58 backdrop-blur-xl flex items-center justify-center"
        transition:fade={{ duration: 200 }}
        on:click|self={close}
        on:keydown={(e) => e.key === "Escape" && close()}
        on:wheel|preventDefault|stopPropagation
        role="button"
        tabindex="0"
    >
        <div
            class="raffi-modal-surface streams-surface rounded-4xl bg-[#2a2a2a]/56 backdrop-blur-[40px] p-[clamp(18px,2vw,32px)] flex flex-col gap-6 overflow-hidden relative isolate shadow-[0_40px_160px_rgba(0,0,0,0.45)]"
            on:wheel|stopPropagation
        >
            <button
                class="absolute top-6 right-6 z-10 text-white/50 hover:text-white cursor-pointer"
                on:click={close}
                aria-label="Close streams"
            >
                <X size={24} color="currentColor" strokeWidth={2} />
            </button>

            <div class="streams-layout relative z-10 grid flex-1 min-h-0 gap-[clamp(18px,2vw,30px)]">
                <section class="flex min-h-0 flex-col overflow-hidden">
                    <EpisodeDetailsPanel
                        {selectedEpisode}
                        {metaData}
                        {releaseInfo}
                        {progressDetails}
                    />
                </section>

                <section class="flex min-h-0 flex-col gap-4">
                    <div class="flex flex-col gap-2 pr-10">
                        <h2 class="text-white text-2xl font-poppins font-bold">
                            Select Stream
                        </h2>
                        <p class="text-white/60 text-sm">
                            Pick a source to start watching. Some sources may take longer to load.
                        </p>
                        {#if $streamFailureMessage}
                            <p class="text-red-300/90 text-sm bg-red-500/14 backdrop-blur-xl rounded-xl px-3 py-2">
                                {$streamFailureMessage}
                            </p>
                        {/if}
                    </div>

                    {#if filteredAddons.length > 1 && !hasDirectStream}
                        <div class="flex flex-wrap gap-2.5">
                            {#each filteredAddons as addon}
                                <button
                                    type="button"
                                    class="px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 cursor-pointer whitespace-nowrap backdrop-blur-xl {selectedAddon === addon.transport_url
                                        ? 'bg-white text-black shadow-lg shadow-white/10'
                                        : 'bg-white/10 text-white/70 hover:bg-white/18'}"
                                    on:click={() => selectAddon(addon)}
                                >
                                    {addon.manifest.name}
                                </button>
                            {/each}
                        </div>
                    {/if}

                    {#if !loadingStreams && streams.length > 0}
                        <StreamsFiltersPanel
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
                        onOpenAddons={handleOpenAddons}
                    />
                </section>
            </div>
        </div>
    </div>
{/if}

<style>
    .streams-surface {
        width: min(1024px, calc(100vw - (2 * var(--raffi-modal-gutter))));
        max-width: 1024px;
    }

    .streams-layout {
        grid-template-columns: minmax(340px, 410px) minmax(0, 1fr);
    }

    @media (max-width: 900px), (orientation: portrait) {
        .streams-surface {
            width: 100%;
            overflow-y: auto;
        }

        .streams-layout {
            grid-template-columns: minmax(0, 1fr);
            overflow: visible;
        }

        .streams-layout > section {
            overflow: visible;
        }
    }
</style>
