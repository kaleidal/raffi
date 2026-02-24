<script lang="ts">
    import { fade } from "svelte/transition";
    import { createEventDispatcher } from "svelte";
    import { X } from "lucide-svelte";
    import { trackEvent } from "../../../lib/analytics";
    import type { Addon } from "../../../lib/db/db";
    import type { ShowResponse } from "../../../lib/library/types/meta_types";
    import type { ProgressItem, ProgressMap } from "../../../pages/meta/types";
    import EpisodeDetailsPanel from "./streams/EpisodeDetailsPanel.svelte";
    import StreamsFiltersPanel from "./streams/StreamsFiltersPanel.svelte";
    import StreamsList from "./streams/StreamsList.svelte";
    import {
        RESOLUTION_FILTERS,
        applyStreamFilters,
        areFiltersActive,
        buildEnrichedStreams,
        getFilteredAddons,
        getProviderFilterOptions,
        getStreamCounts,
        splitStreamsBySource,
    } from "./streams/streamFilters";
    import { computeProgressDetails, getProgressEntry, getReleaseInfo } from "./streams/episodeDetails";
    import type { AudioFilter, ResolutionFilter, EpisodeProgressDetails } from "./streams/types";

    export let streamsPopupVisible = false;
    export let addons: Addon[] = [];
    export let selectedAddon: string;
    export let loadingStreams = false;
    export let streams: any[] = [];
    export let metaData: ShowResponse | null = null;
    export let selectedEpisode: any = null;
    export let progressMap: ProgressMap | null = null;
    export let progressSignature: string | number | null = null;

    const dispatch = createEventDispatcher();

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
    let ignoreSubbed = true;
    let excludeDubbed = false;
    let filtersCollapsed = false;
    let excludeHDR = false;
    let hasTrackedOpen = false;

    let episodeProgressEntry: ProgressItem | null = null;
    let progressDetails: EpisodeProgressDetails | null = null;

    function getStreamCountsNow() {
        return getStreamCounts(streams);
    }

    function resetFilters() {
        resolutionFilter = "all";
        providerFilter = "all";
        audioFilter = "all";
        ignoreSubbed = true;
        excludeDubbed = false;
        excludeHDR = false;
        trackEvent("stream_filters_reset", getStreamCountsNow());
    }

    function setResolutionFilter(value: ResolutionFilter) {
        if (resolutionFilter === value) return;
        resolutionFilter = value;
        trackEvent("stream_filter_resolution", {
            value,
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
            ignore_subbed: ignoreSubbed,
            exclude_dubbed: excludeDubbed,
            exclude_hdr: excludeHDR,
            ...getStreamCountsNow(),
        });
    }

    function setAudioFilter(value: AudioFilter) {
        if (audioFilter === value) return;
        audioFilter = value;
        if (audioFilter === "subbed") {
            ignoreSubbed = false;
        }
        trackEvent("stream_filter_audio", {
            value,
            resolution_filter: resolutionFilter,
            provider_filter: providerFilter,
            ignore_subbed: ignoreSubbed,
            exclude_dubbed: excludeDubbed,
            exclude_hdr: excludeHDR,
            ...getStreamCountsNow(),
        });
    }

    function toggleIgnoreSubbed() {
        ignoreSubbed = !ignoreSubbed;
        trackEvent("stream_filter_ignore_subbed", {
            ignored: ignoreSubbed,
            resolution_filter: resolutionFilter,
            provider_filter: providerFilter,
            audio_filter: audioFilter,
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
            ignore_subbed: ignoreSubbed,
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
            ignore_subbed: ignoreSubbed,
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
        trackEvent("stream_list_closed", {
            filters_active: filtersActive,
            resolution_filter: resolutionFilter,
            provider_filter: providerFilter,
            audio_filter: audioFilter,
            ignore_subbed: ignoreSubbed,
            exclude_dubbed: excludeDubbed,
            exclude_hdr: excludeHDR,
            ...getStreamCountsNow(),
        });
        dispatch("close");
    }

    function onStreamClick(stream: any) {
        dispatch("streamClick", stream);
    }

    $: filterState = {
        resolutionFilter,
        providerFilter,
        audioFilter,
        ignoreSubbed,
        excludeDubbed,
        excludeHDR,
    };

    $: filteredAddons = getFilteredAddons(addons);
    $: enrichedStreams = buildEnrichedStreams(streams);
    $: providerFilterOptions = getProviderFilterOptions(enrichedStreams);

    $: if (providerFilter !== "all" && !providerFilterOptions.includes(providerFilter)) {
        providerFilter = "all";
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
        hasTrackedOpen = true;
        trackEvent("stream_list_opened", {
            ...getStreamCountsNow(),
            resolution_filter: resolutionFilter,
            provider_filter: providerFilter,
            audio_filter: audioFilter,
            ignore_subbed: ignoreSubbed,
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
        class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 sm:p-10 lg:p-20"
        transition:fade={{ duration: 200 }}
        on:click|self={close}
        on:keydown={(e) => e.key === "Escape" && close()}
        on:wheel|preventDefault|stopPropagation
        role="button"
        tabindex="0"
    >
        <div
            class="bg-[#121212] w-full max-w-6xl max-h-full rounded-4xl p-6 sm:p-8 lg:p-10 flex flex-col gap-6 overflow-hidden relative"
            on:wheel|stopPropagation
        >
            <button
                class="absolute top-6 right-6 text-white/50 hover:text-white cursor-pointer"
                on:click={close}
                aria-label="Close streams"
            >
                <X size={24} color="currentColor" strokeWidth={2} />
            </button>

            <div class="flex flex-col lg:flex-row gap-8 flex-1 min-h-0">
                <EpisodeDetailsPanel
                    {selectedEpisode}
                    {metaData}
                    {releaseInfo}
                    {progressDetails}
                />

                <section class="flex-1 flex flex-col gap-5 min-h-0">
                    <div class="flex flex-col gap-2">
                        <h2 class="text-white text-2xl font-poppins font-bold">
                            Select Stream
                        </h2>
                        <p class="text-white/60 text-sm">
                            Pick a source to start watching. Some sources may take longer to load.
                        </p>
                    </div>

                    {#if filteredAddons.length > 1}
                        <div class="flex flex-wrap gap-3 pb-1">
                            {#each filteredAddons as addon}
                                <button
                                    type="button"
                                    class="px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 cursor-pointer whitespace-nowrap {selectedAddon ===
                                    addon.transport_url
                                        ? 'bg-white text-black shadow-lg shadow-white/10'
                                        : 'bg-white/10 text-white/70 hover:bg-white/20'}"
                                    on:click={() => selectAddon(addon)}
                                >
                                    {addon.manifest.name}
                                </button>
                            {/each}
                        </div>
                    {/if}

                    <StreamsFiltersPanel
                        {filtersCollapsed}
                        filteredCount={filteredStreams.length}
                        totalCount={streams.length}
                        {resolutionFilter}
                        {providerFilter}
                        {audioFilter}
                        {ignoreSubbed}
                        {excludeDubbed}
                        {excludeHDR}
                        {filtersActive}
                        {providerFilterOptions}
                        resolutionFilters={RESOLUTION_FILTERS}
                        on:toggleFiltersCollapsed={() => (filtersCollapsed = !filtersCollapsed)}
                        on:setResolutionFilter={(e) => setResolutionFilter(e.detail)}
                        on:setProviderFilter={(e) => setProviderFilter(e.detail)}
                        on:setAudioFilter={(e) => setAudioFilter(e.detail)}
                        on:toggleIgnoreSubbed={toggleIgnoreSubbed}
                        on:toggleExcludeDubbed={toggleExcludeDubbed}
                        on:toggleExcludeHDR={toggleExcludeHDR}
                        on:resetFilters={resetFilters}
                    />

                    <StreamsList
                        {loadingStreams}
                        {streams}
                        {filteredStreams}
                        {localFilteredStreams}
                        {addonFilteredStreams}
                        on:streamClick={(e) => onStreamClick(e.detail)}
                    />
                </section>
            </div>
        </div>
    </div>
{/if}
