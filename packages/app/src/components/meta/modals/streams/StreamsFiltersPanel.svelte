<script lang="ts">
    import { ChevronDown, ChevronUp, SlidersHorizontal, X } from "@lucide/svelte";
    import CustomSelect from "../../../common/CustomSelect.svelte";
    import type { AudioFilter, ResolutionFilter, SourceFilter, StreamSortOption } from "./types";

    export let filtersCollapsed = false;
    export let filteredCount = 0;
    export let totalCount = 0;
    export let resolutionFilter: ResolutionFilter = "all";
    export let providerFilter = "all";
    export let audioFilter: AudioFilter = "all";
    export let audioLanguageFilter = "all";
    export let sourceFilter: SourceFilter = "all";
    export let sortOption: StreamSortOption = "recommended";
    export let excludeDubbed = false;
    export let excludeHDR = false;
    export let providerFilterOptions: string[] = ["all"];
    export let audioLanguageFilterOptions: string[] = ["all"];
    export let resolutionFilters: Array<{ label: string; value: ResolutionFilter }> = [];
    export let sourceFilters: Array<{ label: string; value: SourceFilter }> = [];
    export let sortOptions: Array<{ label: string; value: StreamSortOption }> = [];

    export let onToggleFiltersCollapsed: () => void = () => {};
    export let onSetResolutionFilter: (value: ResolutionFilter) => void = () => {};
    export let onSetProviderFilter: (value: string) => void = () => {};
    export let onSetAudioFilter: (value: AudioFilter) => void = () => {};
    export let onSetAudioLanguageFilter: (value: string) => void = () => {};
    export let onSetSourceFilter: (value: SourceFilter) => void = () => {};
    export let onSetSortOption: (value: StreamSortOption) => void = () => {};
    export let onToggleExcludeDubbed: () => void = () => {};
    export let onToggleExcludeHDR: () => void = () => {};
    export let onResetFilters: () => void = () => {};

    $: sortSelectOptions = sortOptions.map((option) => ({ label: option.label, value: option.value }));
    $: resolutionSelectOptions = resolutionFilters.map((option) => ({ label: option.label, value: option.value }));
    $: sourceSelectOptions = sourceFilters.map((option) => ({ label: option.label, value: option.value }));
    $: providerSelectOptions = providerFilterOptions.map((option) => ({ label: option === "all" ? "Any provider" : option, value: option }));
    $: audioLanguageSelectOptions = audioLanguageFilterOptions.map((option) => ({ label: option === "all" ? "Any language" : option, value: option }));
    $: activeFilterCount = [
        resolutionFilter !== "all",
        providerFilter !== "all",
        audioFilter !== "all",
        audioLanguageFilter !== "all",
        sourceFilter !== "all",
        excludeDubbed,
        excludeHDR,
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
        </div>
    </div>

    {#if !filtersCollapsed}
        <div class="flex flex-col gap-4 border-t border-white/8 pt-4">
            <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <div class="flex min-w-0 flex-col gap-2">
                    <span class="text-xs text-white/45">Audio</span>
                    <div class="flex min-w-0 flex-wrap gap-1.5">
                        {#each [
                            { label: "Any", value: "all" },
                            { label: "Original", value: "original" },
                            { label: "Dubbed", value: "dubbed" },
                        ] as option}
                            <button
                                type="button"
                                class="min-w-0 rounded-full px-2.5 py-2 text-[13px] transition-colors duration-200 cursor-pointer {audioFilter === option.value
                                    ? 'bg-white text-black'
                                    : 'bg-white/8 text-white/72 hover:bg-white/14'}"
                                on:click={() => onSetAudioFilter(option.value as AudioFilter)}
                            >
                                {option.label}
                            </button>
                        {/each}
                    </div>
                </div>

                <label class="flex min-w-0 flex-col gap-2">
                    <span class="text-xs text-white/45">Language</span>
                    <CustomSelect
                        value={audioLanguageFilter}
                        options={audioLanguageSelectOptions}
                        buttonClass="w-full rounded-full bg-white/8 px-4 py-2 text-sm text-white hover:bg-white/12"
                        menuClass="min-w-[164px]"
                        on:change={(event) => onSetAudioLanguageFilter(event.detail.value)}
                    />
                </label>

                <label class="flex min-w-0 flex-col gap-2">
                    <span class="text-xs text-white/45">Quality</span>
                    <CustomSelect
                        value={resolutionFilter}
                        options={resolutionSelectOptions}
                        buttonClass="w-full rounded-full bg-white/8 px-3 py-2 text-sm text-white hover:bg-white/12"
                        menuClass="min-w-[120px]"
                        on:change={(event) => onSetResolutionFilter(event.detail.value as ResolutionFilter)}
                    />
                </label>

                <label class="flex min-w-0 flex-col gap-2">
                    <span class="text-xs text-white/45">Source</span>
                    <CustomSelect
                        value={sourceFilter}
                        options={sourceSelectOptions}
                        buttonClass="w-full rounded-full bg-white/8 px-3 py-2 text-sm text-white hover:bg-white/12"
                        menuClass="min-w-[180px]"
                        on:change={(event) => onSetSourceFilter(event.detail.value as SourceFilter)}
                    />
                </label>

                <label class="flex min-w-0 flex-col gap-2 sm:col-span-2 xl:col-span-2">
                    <span class="text-xs text-white/45">Provider</span>
                    <CustomSelect
                        value={providerFilter}
                        options={providerSelectOptions}
                        buttonClass="w-full rounded-full bg-white/8 px-3 py-2 text-sm text-white hover:bg-white/12"
                        menuClass="min-w-[220px]"
                        on:change={(event) => onSetProviderFilter(event.detail.value)}
                    />
                </label>
            </div>

            <div class="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    class="whitespace-nowrap rounded-full px-3 py-2.5 text-sm transition-colors duration-200 cursor-pointer {excludeDubbed
                        ? 'bg-[#FFDD57] text-black'
                        : 'bg-white/8 text-white/72 hover:bg-white/14'}"
                    on:click={onToggleExcludeDubbed}
                >
                    {excludeDubbed ? "Hiding dubbed" : "Hide dubbed"}
                </button>

                <button
                    type="button"
                    class="whitespace-nowrap rounded-full px-3 py-2.5 text-sm transition-colors duration-200 cursor-pointer {excludeHDR
                        ? 'bg-[#FFDD57] text-black'
                        : 'bg-white/8 text-white/72 hover:bg-white/14'}"
                    on:click={onToggleExcludeHDR}
                >
                    {excludeHDR ? "Skipping HDR" : "Skip HDR"}
                </button>

                {#if activeFilterCount > 0}
                    <button
                        type="button"
                        class="ml-auto flex items-center gap-1.5 rounded-full px-3 py-2.5 text-sm text-white/55 transition-colors hover:bg-white/8 hover:text-white cursor-pointer"
                        on:click={onResetFilters}
                    >
                        <X size={14} strokeWidth={2} />
                        Clear filters
                    </button>
                {/if}
            </div>
        </div>
    {/if}
</div>
