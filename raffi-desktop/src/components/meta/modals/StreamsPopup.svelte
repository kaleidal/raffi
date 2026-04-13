<script lang="ts">
    import { fade } from "svelte/transition";
    import { X } from "@lucide/svelte";
    import { failedStreamKeys, streamFailureMessage } from "../../../pages/meta/metaState";
    import { trackEvent } from "../../../lib/analytics";
    import { overlayZoomStyle } from "../../../lib/overlayZoom";
    import type { Addon } from "../../../lib/db/db";
    import type { ShowResponse } from "../../../lib/library/types/meta_types";
    import type { ProgressItem, ProgressMap } from "../../../pages/meta/types";
    import EpisodeDetailsPanel from "./streams/EpisodeDetailsPanel.svelte";
    import StreamsFiltersPanel from "./streams/StreamsFiltersPanel.svelte";
    import StreamsList from "./streams/StreamsList.svelte";
    import {
        getAudioLanguageFilterOptions,
        getFilteredAddons,
        getProviderFilterOptions,
        getStreamCounts,
        RESOLUTION_FILTERS,
        SOURCE_FILTERS,
        splitStreamsBySource,
        STREAM_SORT_OPTIONS,
        applyStreamFilters,
        areFiltersActive,
        buildEnrichedStreams,
    } from "./streams/streamFilters";
    import { computeProgressDetails, getProgressEntry, getReleaseInfo } from "./streams/episodeDetails";
    import type {
        AudioFilter,
        EpisodeProgressDetails,
        ResolutionFilter,
        SourceFilter,
        StreamSortOption,
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
    let providerFilter = "all";
    let audioFilter: AudioFilter = "all";
    let audioLanguageFilter = "all";
    let sourceFilter: SourceFilter = "all";
    let sortOption: StreamSortOption = "recommended";
    let excludeDubbed = false;
    let filtersCollapsed = true;
    let excludeHDR = false;
    let hasTrackedOpen = false;

    let episodeProgressEntry: ProgressItem | null = null;
    let progressDetails: EpisodeProgressDetails | null = null;

    $: popupBackdropSrc =
        selectedEpisode?.thumbnail ||
        metaData?.meta?.background ||
        metaData?.meta?.poster ||
        null;

    function getStreamCountsNow() {
        return getStreamCounts(streams);
    }

    function resetFilters() {
        resolutionFilter = "all";
        providerFilter = "all";
        audioFilter = "all";
        audioLanguageFilter = "all";
        sourceFilter = "all";
        sortOption = "recommended";
        excludeDubbed = false;
        excludeHDR = false;
        trackEvent("stream_filters_reset", getStreamCountsNow());
    }

    function setResolutionFilter(value: ResolutionFilter) {
        if (resolutionFilter === value) return;
        resolutionFilter = value;
        trackEvent("stream_filter_resolution", {
            value,
            audio_language_filter: audioLanguageFilter,
            source_filter: sourceFilter,
            sort_option: sortOption,
            exclude_hdr: excludeHDR,
            ...getStreamCountsNow(),
        });
    }

    function setProviderFilter(value: string) {
        if (providerFilter === value) return;
        providerFilter = value;
        trackEvent("stream_filter_provider", {
            value,
            resolution_filter: resolutionFilter,
            audio_filter: audioFilter,
            audio_language_filter: audioLanguageFilter,
            source_filter: sourceFilter,
            sort_option: sortOption,
            exclude_dubbed: excludeDubbed,
            exclude_hdr: excludeHDR,
            ...getStreamCountsNow(),
        });
    }

    function setAudioFilter(value: AudioFilter) {
        if (audioFilter === value) return;
        audioFilter = value;
        trackEvent("stream_filter_audio", {
            value,
            resolution_filter: resolutionFilter,
            provider_filter: providerFilter,
            audio_language_filter: audioLanguageFilter,
            source_filter: sourceFilter,
            sort_option: sortOption,
            exclude_dubbed: excludeDubbed,
            exclude_hdr: excludeHDR,
            ...getStreamCountsNow(),
        });
    }

    function setAudioLanguageFilter(value: string) {
        if (audioLanguageFilter === value) return;
        audioLanguageFilter = value;
        trackEvent("stream_filter_audio_language", {
            value,
            resolution_filter: resolutionFilter,
            provider_filter: providerFilter,
            audio_filter: audioFilter,
            source_filter: sourceFilter,
            sort_option: sortOption,
            exclude_dubbed: excludeDubbed,
            exclude_hdr: excludeHDR,
            ...getStreamCountsNow(),
        });
    }

    function setSourceFilter(value: SourceFilter) {
        if (sourceFilter === value) return;
        sourceFilter = value;
        trackEvent("stream_filter_source", {
            value,
            resolution_filter: resolutionFilter,
            provider_filter: providerFilter,
            audio_filter: audioFilter,
            audio_language_filter: audioLanguageFilter,
            sort_option: sortOption,
            exclude_dubbed: excludeDubbed,
            exclude_hdr: excludeHDR,
            ...getStreamCountsNow(),
        });
    }

    function setSortOption(value: StreamSortOption) {
        if (sortOption === value) return;
        sortOption = value;
        trackEvent("stream_sort_changed", {
            value,
            resolution_filter: resolutionFilter,
            provider_filter: providerFilter,
            audio_filter: audioFilter,
            audio_language_filter: audioLanguageFilter,
            source_filter: sourceFilter,
            exclude_dubbed: excludeDubbed,
            exclude_hdr: excludeHDR,
            ...getStreamCountsNow(),
        });
    }

    function toggleExcludeDubbed() {
        excludeDubbed = !excludeDubbed;
        trackEvent("stream_filter_exclude_dubbed", {
            excluded: excludeDubbed,
            resolution_filter: resolutionFilter,
            provider_filter: providerFilter,
            audio_filter: audioFilter,
            audio_language_filter: audioLanguageFilter,
            source_filter: sourceFilter,
            sort_option: sortOption,
            exclude_hdr: excludeHDR,
            ...getStreamCountsNow(),
        });
    }

    function toggleExcludeHDR() {
        excludeHDR = !excludeHDR;
        trackEvent("stream_filter_hdr", {
            excluded: excludeHDR,
            resolution_filter: resolutionFilter,
            provider_filter: providerFilter,
            audio_filter: audioFilter,
            audio_language_filter: audioLanguageFilter,
            source_filter: sourceFilter,
            sort_option: sortOption,
            exclude_dubbed: excludeDubbed,
            ...getStreamCountsNow(),
        });
    }

    function selectAddon(addon: Addon) {
        if (selectedAddon === addon.transport_url) return;
        selectedAddon = addon.transport_url;
        trackEvent("stream_addon_selected", {
            addon_name: addon?.manifest?.name ?? "Unknown",
            ...getStreamCountsNow(),
        });
    }

    function close() {
        streamsPopupVisible = false;
        trackEvent("stream_list_closed", {
            filters_active: filtersActive,
            resolution_filter: resolutionFilter,
            provider_filter: providerFilter,
            audio_filter: audioFilter,
            audio_language_filter: audioLanguageFilter,
            source_filter: sourceFilter,
            sort_option: sortOption,
            exclude_dubbed: excludeDubbed,
            exclude_hdr: excludeHDR,
            ...getStreamCountsNow(),
        });
        onClose();
    }

    function handleStreamClick(stream: any) {
        onStreamClick(stream);
    }

    $: filterState = {
        resolutionFilter,
        providerFilter,
        audioFilter,
        audioLanguageFilter,
        sourceFilter,
        sortOption,
        excludeDubbed,
        excludeHDR,
    };

    $: filteredAddons = getFilteredAddons(addons);
    $: enrichedStreams = buildEnrichedStreams(streams, $failedStreamKeys);
    $: providerFilterOptions = getProviderFilterOptions(enrichedStreams);
    $: audioLanguageFilterOptions = getAudioLanguageFilterOptions(enrichedStreams);
    $: if (providerFilter !== "all" && !providerFilterOptions.includes(providerFilter)) {
        providerFilter = "all";
    }

    $: if (audioLanguageFilter !== "all" && !audioLanguageFilterOptions.includes(audioLanguageFilter)) {
        audioLanguageFilter = "all";
    }

    $: filteredStreams = applyStreamFilters(enrichedStreams, filterState);
    $: ({ localFilteredStreams, addonFilteredStreams } = splitStreamsBySource(filteredStreams));
    $: filtersActive = areFiltersActive(filterState);

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

    $: if (streamsPopupVisible && !hasTrackedOpen) {
        filtersCollapsed = true;
        hasTrackedOpen = true;
        trackEvent("stream_list_opened", {
            ...getStreamCountsNow(),
            resolution_filter: resolutionFilter,
            provider_filter: providerFilter,
            audio_filter: audioFilter,
            audio_language_filter: audioLanguageFilter,
            source_filter: sourceFilter,
            sort_option: sortOption,
            exclude_dubbed: excludeDubbed,
            exclude_hdr: excludeHDR,
        });
    }

    $: if (!streamsPopupVisible && hasTrackedOpen) {
        hasTrackedOpen = false;
    }
</script>

{#if streamsPopupVisible}
    <div
        use:portal
        class="fixed inset-0 z-50 bg-[#0f0f0f]/58 backdrop-blur-xl flex items-center justify-center p-6 sm:p-10 lg:p-20"
        style={overlayZoomStyle}
        transition:fade={{ duration: 200 }}
        on:click|self={close}
        on:keydown={(e) => e.key === "Escape" && close()}
        on:wheel|preventDefault|stopPropagation
        role="button"
        tabindex="0"
    >
        <div
            class="w-full max-w-7xl max-h-full rounded-4xl bg-[#2a2a2a]/56 backdrop-blur-[40px] p-6 sm:p-8 lg:p-10 xl:p-12 flex flex-col gap-6 overflow-hidden relative isolate shadow-[0_40px_160px_rgba(0,0,0,0.45)]"
            on:wheel|stopPropagation
        >
            <button
                class="absolute top-6 right-6 z-10 text-white/50 hover:text-white cursor-pointer"
                on:click={close}
                aria-label="Close streams"
            >
                <X size={24} color="currentColor" strokeWidth={2} />
            </button>

            <div class="relative z-10 grid flex-1 min-h-0 gap-8 lg:grid-cols-[460px_minmax(0,1fr)] xl:grid-cols-[520px_minmax(0,1fr)]">
                <section class="flex min-h-0 flex-col gap-4 overflow-hidden lg:gap-5">
                    <div class="flex-1 min-h-0">
                        <EpisodeDetailsPanel
                            {selectedEpisode}
                            {metaData}
                            {releaseInfo}
                            {progressDetails}
                        />
                    </div>

                    <div class="shrink-0">
                        <StreamsFiltersPanel
                            {filtersCollapsed}
                            filteredCount={filteredStreams.length}
                            totalCount={streams.length}
                            {resolutionFilter}
                            {providerFilter}
                            {audioFilter}
                            {audioLanguageFilter}
                            {sourceFilter}
                            {sortOption}
                            {excludeDubbed}
                            {excludeHDR}
                            {filtersActive}
                            {providerFilterOptions}
                            {audioLanguageFilterOptions}
                            resolutionFilters={RESOLUTION_FILTERS}
                            sourceFilters={SOURCE_FILTERS}
                            sortOptions={STREAM_SORT_OPTIONS}
                            onToggleFiltersCollapsed={() => (filtersCollapsed = !filtersCollapsed)}
                            onSetResolutionFilter={setResolutionFilter}
                            onSetProviderFilter={setProviderFilter}
                            onSetAudioFilter={setAudioFilter}
                            onSetAudioLanguageFilter={setAudioLanguageFilter}
                            onSetSourceFilter={setSourceFilter}
                            onSetSortOption={setSortOption}
                            onToggleExcludeDubbed={toggleExcludeDubbed}
                            onToggleExcludeHDR={toggleExcludeHDR}
                            onResetFilters={resetFilters}
                        />
                    </div>
                </section>

                <section class="flex min-h-0 flex-col gap-5">
                    <div class="flex flex-col gap-2">
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

                    {#if filteredAddons.length > 1}
                        <div class="flex flex-wrap gap-2.5 pb-1">
                            {#each filteredAddons as addon}
                                <button
                                    type="button"
                                    class="px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 cursor-pointer whitespace-nowrap backdrop-blur-xl {selectedAddon ===
                                    addon.transport_url
                                        ? 'bg-white text-black shadow-lg shadow-white/10'
                                        : 'bg-white/10 text-white/70 hover:bg-white/18'}"
                                    on:click={() => selectAddon(addon)}
                                >
                                    {addon.manifest.name}
                                </button>
                            {/each}
                        </div>
                    {/if}

                    <StreamsList
                        {loadingStreams}
                        {streams}
                        {filteredStreams}
                        {localFilteredStreams}
                        {addonFilteredStreams}
                        onStreamClick={handleStreamClick}
                    />
                </section>
            </div>
        </div>
    </div>
{/if}
