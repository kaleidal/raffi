<script lang="ts">
    import { portal } from "../../common/portal";
    import { lockPageScroll } from "../../common/scrollLock";
    import ChipRail from "../../common/ChipRail.svelte";
    import { fade, fly } from "svelte/transition";
    import { Play, X } from "@lucide/svelte";
    import { failedStreamKeys, streamFailureMessage } from "../../../pages/meta/metaState";
    import type { Addon } from "../../../lib/db/db";
    import type { ShowResponse } from "../../../lib/library/types/meta_types";
    import type { ProgressMap } from "../../../lib/library/types/progress";
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
    import { withAvailabilityHint } from "../../../lib/streams/ranking/streamSelection";
    import { pickBestStream, rankingContext } from "../../../lib/streams/ranking/streamRanking";
    import type { EnrichedStream } from "../../../lib/streams/ranking/types";
    import { computeProgressDetails, getProgressEntry, getReleaseInfo } from "./streams/episodeDetails";
    import type {
        ResolutionFilter,
        StreamSortOption,
        VideoCodecFilter,
        DynamicRangeFilter,
        AvailabilityFilter,
        SizeFilter,
    } from "./streams/types";

    let {
        streamsPopupVisible = $bindable(false),
        addons = [],
        selectedAddon = $bindable(),
        loadingStreams = false,
        streams = [],
        metaData = null,
        selectedEpisode = null,
        progressMap = null,
        progressSignature = null,
        onClose = () => {},
        onStreamClick = () => {},
    }: {
        streamsPopupVisible?: boolean;
        addons?: Addon[];
        selectedAddon: string;
        loadingStreams?: boolean;
        streams?: any[];
        metaData?: ShowResponse | null;
        selectedEpisode?: any;
        progressMap?: ProgressMap | null;
        progressSignature?: string | number | null;
        onClose?: () => void;
        onStreamClick?: (stream: any) => void;
    } = $props();

    let resolutionFilter = $state<ResolutionFilter>("all");
    let audioLanguageFilter = $state("all");
    let sortOption = $state<StreamSortOption>("recommended");
    let filtersCollapsed = $state(true);
    let videoCodecFilter = $state<VideoCodecFilter>("all");
    let dynamicRangeFilter = $state<DynamicRangeFilter>("all");
    let availabilityFilter = $state<AvailabilityFilter>("all");
    let sizeFilter = $state<SizeFilter>("all");

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
        onStreamClick(withAvailabilityHint(item));
    }

    const filterState = $derived({
        resolutionFilter,
        audioLanguageFilter,
        sortOption,
        videoCodecFilter,
        dynamicRangeFilter,
        availabilityFilter,
        sizeFilter,
    });

    const filteredAddons = $derived(getFilteredAddons(addons));
    const visibleStreams = $derived(
        $allowTorrenting
            ? streams
            : streams.filter((stream) => !isTorrentSource(stream)),
    );
    const enrichedStreams = $derived(buildEnrichedStreams(visibleStreams, $failedStreamKeys));
    const audioLanguageFilterOptions = $derived(getAudioLanguageFilterOptions(enrichedStreams));
    const availableFilterOptions = $derived(getAvailableStreamFilterOptions(enrichedStreams));

    $effect.pre(() => {
        if (audioLanguageFilter !== "all" && !audioLanguageFilterOptions.includes(audioLanguageFilter)) {
            audioLanguageFilter = "all";
        }
        if (!availableFilterOptions.resolutions.some((option) => option.value === resolutionFilter)) {
            resolutionFilter = "all";
        }
        if (!availableFilterOptions.codecs.some((option) => option.value === videoCodecFilter)) {
            videoCodecFilter = "all";
        }
        if (!availableFilterOptions.dynamicRanges.some((option) => option.value === dynamicRangeFilter)) {
            dynamicRangeFilter = "all";
        }
        if (!availableFilterOptions.availability.some((option) => option.value === availabilityFilter)) {
            availabilityFilter = "all";
        }
        if (!availableFilterOptions.sizes.some((option) => option.value === sizeFilter)) {
            sizeFilter = "all";
        }
    });

    const ranking = rankingContext();

    const filteredStreams = $derived(applyStreamFilters(enrichedStreams, filterState, ranking));
    const { localFilteredStreams, addonFilteredStreams } = $derived(splitStreamsBySource(filteredStreams));
    const bestStream = $derived(
        pickBestStream(filteredStreams, ranking) ?? filteredStreams.find((item) => !item.isFailed) ?? null,
    );
    const hasDirectStream = $derived(visibleStreams.some((stream) => stream?.raffiSource === "direct"));
    const showAddonSetupGuide = $derived(
        visibleStreams.length === 0 &&
            filteredAddons.length === 0 &&
            !$streamFailureMessage?.toLowerCase().includes("direct link"),
    );

    const releaseInfo = $derived(
        getReleaseInfo(
            selectedEpisode?.released ||
                selectedEpisode?.firstAired ||
                metaData?.meta?.released ||
                null,
        ),
    );

    const progressDetails = $derived.by(() => {
        void progressSignature;
        return computeProgressDetails(
            getProgressEntry(progressMap, streamsPopupVisible, selectedEpisode, metaData),
        );
    });

    $effect.pre(() => {
        if (streamsPopupVisible) filtersCollapsed = true;
    });
</script>

{#if streamsPopupVisible}
    <div
        use:portal
        use:lockPageScroll
        class="fixed inset-0 z-50 bg-canvas/35"
        transition:fade={{ duration: 200 }}
        onclick={(event) => event.target === event.currentTarget && close()}
        onkeydown={(e) => e.key === "Escape" && close()}
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
                    onclick={close}
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
                    onclick={() => bestStream && handleStreamClick(bestStream)}
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
                            onclick={() => selectAddon(addon)}
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
