<script lang="ts">
    import { ChevronDown, ChevronUp, SlidersHorizontal, X } from "@lucide/svelte";
    import CustomSelect from "../../../common/CustomSelect.svelte";
    import FilterSelect from "./FilterSelect.svelte";
    import type {
        AvailabilityFilter,
        DynamicRangeFilter,
        ResolutionFilter,
        SizeFilter,
        StreamSortOption,
        VideoCodecFilter,
    } from "./types";

    export let filtersCollapsed = false;
    export let filteredCount = 0;
    export let totalCount = 0;
    export let resolutionFilter: ResolutionFilter = "all";
    export let audioLanguageFilter = "all";
    export let videoCodecFilter: VideoCodecFilter = "all";
    export let dynamicRangeFilter: DynamicRangeFilter = "all";
    export let availabilityFilter: AvailabilityFilter = "all";
    export let sizeFilter: SizeFilter = "all";
    export let sortOption: StreamSortOption = "recommended";
    export let audioLanguageFilterOptions: string[] = ["all"];
    export let resolutionFilters: Array<{ label: string; value: ResolutionFilter }> = [];
    export let videoCodecFilters: Array<{ label: string; value: VideoCodecFilter }> = [];
    export let dynamicRangeFilters: Array<{ label: string; value: DynamicRangeFilter }> = [];
    export let availabilityFilters: Array<{ label: string; value: AvailabilityFilter }> = [];
    export let sizeFilters: Array<{ label: string; value: SizeFilter }> = [];
    export let sortOptions: Array<{ label: string; value: StreamSortOption }> = [];

    export let onToggleFiltersCollapsed: () => void = () => {};
    export let onSetResolutionFilter: (value: ResolutionFilter) => void = () => {};
    export let onSetAudioLanguageFilter: (value: string) => void = () => {};
    export let onSetVideoCodecFilter: (value: VideoCodecFilter) => void = () => {};
    export let onSetDynamicRangeFilter: (value: DynamicRangeFilter) => void = () => {};
    export let onSetAvailabilityFilter: (value: AvailabilityFilter) => void = () => {};
    export let onSetSizeFilter: (value: SizeFilter) => void = () => {};
    export let onSetSortOption: (value: StreamSortOption) => void = () => {};
    export let onResetFilters: () => void = () => {};

    $: sortSelectOptions = sortOptions.map((option) => ({ label: option.label, value: option.value }));
    $: resolutionSelectOptions = resolutionFilters.map((option) => ({ label: option.label, value: option.value }));
    $: languageSelectOptions = audioLanguageFilterOptions.map((value) => ({
        label: value === "all" ? "Any language" : value,
        value,
    }));
    $: codecSelectOptions = videoCodecFilters.map((option) => ({ label: option.label, value: option.value }));
    $: rangeSelectOptions = dynamicRangeFilters.map((option) => ({ label: option.label, value: option.value }));
    $: availabilitySelectOptions = availabilityFilters.map((option) => ({ label: option.label, value: option.value }));
    $: sizeSelectOptions = sizeFilters.map((option) => ({ label: option.label, value: option.value }));
    $: activeFilterCount = [
        resolutionFilter !== "all",
        audioLanguageFilter !== "all",
        videoCodecFilter !== "all",
        dynamicRangeFilter !== "all",
        availabilityFilter !== "all",
        sizeFilter !== "all",
    ].filter(Boolean).length;
    $: usefulControlCount = [
        resolutionFilters.length > 2,
        audioLanguageFilterOptions.length > 2,
        videoCodecFilters.length > 2,
        dynamicRangeFilters.length > 2,
        availabilityFilters.length > 1,
        sizeFilters.length > 1,
    ].filter(Boolean).length;
</script>

<div class="flex shrink-0 flex-col gap-3 rounded-[22px] bg-white/5 p-3.5">
    <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-2 text-sm">
            <span class="font-semibold text-white">
                {filteredCount} {filteredCount === 1 ? "source" : "sources"}
            </span>
            {#if activeFilterCount > 0 && filteredCount !== totalCount}
                <span class="text-white/45">of {totalCount}</span>
            {/if}
        </div>

        <div class="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
            <div class="w-[clamp(145px,12vw,178px)] shrink-0">
                <CustomSelect
                    value={sortOption}
                    options={sortSelectOptions}
                    buttonClass="rounded-full bg-white/8 px-3 py-2 text-sm text-white/75 hover:bg-white/12"
                    menuClass="w-[200px]"
                    on:change={(event) => onSetSortOption(event.detail.value as StreamSortOption)}
                />
            </div>

            {#if activeFilterCount > 0}
                <button
                    type="button"
                    class="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-white/55 transition-colors hover:bg-white/8 hover:text-white cursor-pointer"
                    on:click={onResetFilters}
                >
                    <X size={14} strokeWidth={2} />
                    Clear
                </button>
            {/if}

            {#if usefulControlCount > 0 || activeFilterCount > 0}
                <button
                    type="button"
                    class="flex items-center gap-2 rounded-full px-3.5 py-2 text-sm transition-colors duration-200 cursor-pointer {filtersCollapsed
                        ? 'bg-white/10 text-white/80 hover:bg-white/16'
                        : 'bg-white text-black'}"
                    on:click={onToggleFiltersCollapsed}
                >
                    <SlidersHorizontal size={15} strokeWidth={2} />
                    Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
                    {#if filtersCollapsed}
                        <ChevronDown size={15} strokeWidth={2} />
                    {:else}
                        <ChevronUp size={15} strokeWidth={2} />
                    {/if}
                </button>
            {/if}
        </div>
    </div>

    {#if !filtersCollapsed && usefulControlCount > 0}
        <div class="grid gap-3 border-t border-white/8 pt-4 sm:grid-cols-2 xl:grid-cols-3">
            {#if resolutionFilters.length > 2}
                <FilterSelect label="Quality">
                    <CustomSelect
                        value={resolutionFilter}
                        options={resolutionSelectOptions}
                        buttonClass="w-full rounded-full bg-white/8 px-3 py-2 text-sm text-white hover:bg-white/12"
                        on:change={(event) => onSetResolutionFilter(event.detail.value as ResolutionFilter)}
                    />
                </FilterSelect>
            {/if}

            {#if audioLanguageFilterOptions.length > 2}
                <FilterSelect label="Audio language">
                    <CustomSelect
                        value={audioLanguageFilter}
                        options={languageSelectOptions}
                        buttonClass="w-full rounded-full bg-white/8 px-3 py-2 text-sm text-white hover:bg-white/12"
                        on:change={(event) => onSetAudioLanguageFilter(event.detail.value)}
                    />
                </FilterSelect>
            {/if}

            {#if videoCodecFilters.length > 2}
                <FilterSelect label="Video codec">
                    <CustomSelect
                        value={videoCodecFilter}
                        options={codecSelectOptions}
                        buttonClass="w-full rounded-full bg-white/8 px-3 py-2 text-sm text-white hover:bg-white/12"
                        on:change={(event) => onSetVideoCodecFilter(event.detail.value as VideoCodecFilter)}
                    />
                </FilterSelect>
            {/if}

            {#if dynamicRangeFilters.length > 2}
                <FilterSelect label="Dynamic range">
                    <CustomSelect
                        value={dynamicRangeFilter}
                        options={rangeSelectOptions}
                        buttonClass="w-full rounded-full bg-white/8 px-3 py-2 text-sm text-white hover:bg-white/12"
                        on:change={(event) => onSetDynamicRangeFilter(event.detail.value as DynamicRangeFilter)}
                    />
                </FilterSelect>
            {/if}

            {#if availabilityFilters.length > 1}
                <FilterSelect label="Availability">
                    <CustomSelect
                        value={availabilityFilter}
                        options={availabilitySelectOptions}
                        buttonClass="w-full rounded-full bg-white/8 px-3 py-2 text-sm text-white hover:bg-white/12"
                        on:change={(event) => onSetAvailabilityFilter(event.detail.value as AvailabilityFilter)}
                    />
                </FilterSelect>
            {/if}

            {#if sizeFilters.length > 1}
                <FilterSelect label="Maximum size">
                    <CustomSelect
                        value={sizeFilter}
                        options={sizeSelectOptions}
                        buttonClass="w-full rounded-full bg-white/8 px-3 py-2 text-sm text-white hover:bg-white/12"
                        on:change={(event) => onSetSizeFilter(event.detail.value as SizeFilter)}
                    />
                </FilterSelect>
            {/if}
        </div>
    {/if}
</div>
