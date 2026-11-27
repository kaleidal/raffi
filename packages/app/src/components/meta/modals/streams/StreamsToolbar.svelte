<script lang="ts">
    import { SlidersHorizontal, X } from "@lucide/svelte";
    import CustomSelect from "../../../common/controls/CustomSelect.svelte";
    import FilterSelect from "./FilterSelect.svelte";
    import ChipRail from "../../../common/ChipRail.svelte";
    import type {
        AvailabilityFilter,
        DynamicRangeFilter,
        ResolutionFilter,
        SizeFilter,
        StreamSortOption,
        VideoCodecFilter,
    } from "./types";

    let {
        filtersCollapsed = false,
        filteredCount = 0,
        totalCount = 0,
        resolutionFilter = "all",
        audioLanguageFilter = "all",
        videoCodecFilter = "all",
        dynamicRangeFilter = "all",
        availabilityFilter = "all",
        sizeFilter = "all",
        sortOption = "recommended",
        audioLanguageFilterOptions = ["all"],
        resolutionFilters = [],
        videoCodecFilters = [],
        dynamicRangeFilters = [],
        availabilityFilters = [],
        sizeFilters = [],
        sortOptions = [],
        onToggleFiltersCollapsed = () => {},
        onSetResolutionFilter = () => {},
        onSetAudioLanguageFilter = () => {},
        onSetVideoCodecFilter = () => {},
        onSetDynamicRangeFilter = () => {},
        onSetAvailabilityFilter = () => {},
        onSetSizeFilter = () => {},
        onSetSortOption = () => {},
        onResetFilters = () => {},
    }: {
        filtersCollapsed?: boolean;
        filteredCount?: number;
        totalCount?: number;
        resolutionFilter?: ResolutionFilter;
        audioLanguageFilter?: string;
        videoCodecFilter?: VideoCodecFilter;
        dynamicRangeFilter?: DynamicRangeFilter;
        availabilityFilter?: AvailabilityFilter;
        sizeFilter?: SizeFilter;
        sortOption?: StreamSortOption;
        audioLanguageFilterOptions?: string[];
        resolutionFilters?: Array<{ label: string; value: ResolutionFilter }>;
        videoCodecFilters?: Array<{ label: string; value: VideoCodecFilter }>;
        dynamicRangeFilters?: Array<{ label: string; value: DynamicRangeFilter }>;
        availabilityFilters?: Array<{ label: string; value: AvailabilityFilter }>;
        sizeFilters?: Array<{ label: string; value: SizeFilter }>;
        sortOptions?: Array<{ label: string; value: StreamSortOption }>;
        onToggleFiltersCollapsed?: () => void;
        onSetResolutionFilter?: (value: ResolutionFilter) => void;
        onSetAudioLanguageFilter?: (value: string) => void;
        onSetVideoCodecFilter?: (value: VideoCodecFilter) => void;
        onSetDynamicRangeFilter?: (value: DynamicRangeFilter) => void;
        onSetAvailabilityFilter?: (value: AvailabilityFilter) => void;
        onSetSizeFilter?: (value: SizeFilter) => void;
        onSetSortOption?: (value: StreamSortOption) => void;
        onResetFilters?: () => void;
    } = $props();

    const sortSelectOptions = $derived(sortOptions.map((option) => ({ label: option.label, value: option.value })));
    const languageSelectOptions = $derived(
        audioLanguageFilterOptions.map((value) => ({
            label: value === "all" ? "Any language" : value,
            value,
        })),
    );
    const codecSelectOptions = $derived(videoCodecFilters.map((option) => ({ label: option.label, value: option.value })));
    const rangeSelectOptions = $derived(dynamicRangeFilters.map((option) => ({ label: option.label, value: option.value })));
    const availabilitySelectOptions = $derived(availabilityFilters.map((option) => ({ label: option.label, value: option.value })));
    const sizeSelectOptions = $derived(sizeFilters.map((option) => ({ label: option.label, value: option.value })));
    const activeFilterCount = $derived(
        [
            audioLanguageFilter !== "all",
            videoCodecFilter !== "all",
            dynamicRangeFilter !== "all",
            availabilityFilter !== "all",
            sizeFilter !== "all",
        ].filter(Boolean).length,
    );
    const usefulControlCount = $derived(
        [
            audioLanguageFilterOptions.length > 2,
            videoCodecFilters.length > 2,
            dynamicRangeFilters.length > 2,
            availabilityFilters.length > 1,
            sizeFilters.length > 1,
        ].filter(Boolean).length,
    );
</script>

<div class="flex shrink-0 flex-col gap-3">
    <div class="flex items-center gap-3">
        <div class="min-w-0 flex-1">
            {#if resolutionFilters.length > 2}
                <ChipRail>
                    {#each resolutionFilters as option (option.value)}
                        <button
                            class="shrink-0 cursor-pointer rounded-full px-4 py-2 text-sm font-medium transition-colors {resolutionFilter === option.value
                                ? 'bg-accent text-on-accent'
                                : 'bg-ink/8 text-ink/75 hover:bg-ink/14 hover:text-ink'}"
                            onclick={() => onSetResolutionFilter(option.value)}
                        >
                            {option.label}
                        </button>
                    {/each}
                </ChipRail>
            {:else}
                <p class="text-sm text-ink/55">
                    {filteredCount} {filteredCount === 1 ? "source" : "sources"}{activeFilterCount > 0 && filteredCount !== totalCount ? ` of ${totalCount}` : ""}
                </p>
            {/if}
        </div>

        <div class="w-[clamp(140px,11vw,170px)] shrink-0">
            <CustomSelect
                value={sortOption}
                options={sortSelectOptions}
                align="right"
                buttonClass="rounded-full bg-ink/8 px-4 py-2 text-sm text-ink/80 hover:bg-ink/12"
                menuClass="w-[200px]"
                onChange={(value) => onSetSortOption(value as StreamSortOption)}
            />
        </div>

        {#if usefulControlCount > 0}
            <button
                type="button"
                class="flex shrink-0 cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors {filtersCollapsed
                    ? 'bg-ink/8 text-ink/80 hover:bg-ink/12'
                    : 'bg-accent text-on-accent'}"
                aria-expanded={!filtersCollapsed}
                onclick={onToggleFiltersCollapsed}
            >
                <SlidersHorizontal size={15} strokeWidth={2} />
                {activeFilterCount > 0 ? `Filters · ${activeFilterCount}` : "Filters"}
            </button>
        {/if}
    </div>

    {#if !filtersCollapsed && usefulControlCount > 0}
        <div class="grid gap-3 rounded-3xl bg-ink/5 p-4 sm:grid-cols-2">
            {#if audioLanguageFilterOptions.length > 2}
                <FilterSelect label="Audio language">
                    <CustomSelect
                        value={audioLanguageFilter}
                        options={languageSelectOptions}
                        buttonClass="w-full rounded-full bg-ink/8 px-3 py-2 text-sm text-ink hover:bg-ink/12"
                        onChange={onSetAudioLanguageFilter}
                    />
                </FilterSelect>
            {/if}

            {#if videoCodecFilters.length > 2}
                <FilterSelect label="Video codec">
                    <CustomSelect
                        value={videoCodecFilter}
                        options={codecSelectOptions}
                        buttonClass="w-full rounded-full bg-ink/8 px-3 py-2 text-sm text-ink hover:bg-ink/12"
                        onChange={(value) => onSetVideoCodecFilter(value as VideoCodecFilter)}
                    />
                </FilterSelect>
            {/if}

            {#if dynamicRangeFilters.length > 2}
                <FilterSelect label="Dynamic range">
                    <CustomSelect
                        value={dynamicRangeFilter}
                        options={rangeSelectOptions}
                        buttonClass="w-full rounded-full bg-ink/8 px-3 py-2 text-sm text-ink hover:bg-ink/12"
                        onChange={(value) => onSetDynamicRangeFilter(value as DynamicRangeFilter)}
                    />
                </FilterSelect>
            {/if}

            {#if availabilityFilters.length > 1}
                <FilterSelect label="Availability">
                    <CustomSelect
                        value={availabilityFilter}
                        options={availabilitySelectOptions}
                        buttonClass="w-full rounded-full bg-ink/8 px-3 py-2 text-sm text-ink hover:bg-ink/12"
                        onChange={(value) => onSetAvailabilityFilter(value as AvailabilityFilter)}
                    />
                </FilterSelect>
            {/if}

            {#if sizeFilters.length > 1}
                <FilterSelect label="Maximum size">
                    <CustomSelect
                        value={sizeFilter}
                        options={sizeSelectOptions}
                        buttonClass="w-full rounded-full bg-ink/8 px-3 py-2 text-sm text-ink hover:bg-ink/12"
                        onChange={(value) => onSetSizeFilter(value as SizeFilter)}
                    />
                </FilterSelect>
            {/if}
            {#if activeFilterCount > 0}
                <button
                    type="button"
                    class="flex cursor-pointer items-center gap-1.5 self-end justify-self-start rounded-full px-3 py-2 text-sm text-ink/55 transition-colors hover:bg-ink/8 hover:text-ink"
                    onclick={onResetFilters}
                >
                    <X size={14} strokeWidth={2} />
                    Clear filters
                </button>
            {/if}
        </div>
    {/if}
</div>
