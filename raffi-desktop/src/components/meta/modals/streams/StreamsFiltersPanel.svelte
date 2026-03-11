<script lang="ts">
    import { ChevronDown, ChevronUp } from "lucide-svelte";
    import type { AudioFilter, ResolutionFilter } from "./types";

    export let filtersCollapsed = false;
    export let filteredCount = 0;
    export let totalCount = 0;
    export let resolutionFilter: ResolutionFilter = "all";
    export let providerFilter = "all";
    export let audioFilter: AudioFilter = "all";
    export let ignoreSubbed = true;
    export let excludeDubbed = false;
    export let excludeHDR = false;
    export let filtersActive = false;
    export let providerFilterOptions: string[] = ["all"];
    export let resolutionFilters: Array<{ label: string; value: ResolutionFilter }> = [];

    export let onToggleFiltersCollapsed: () => void = () => {};
    export let onSetResolutionFilter: (value: ResolutionFilter) => void = () => {};
    export let onSetProviderFilter: (value: string) => void = () => {};
    export let onSetAudioFilter: (value: AudioFilter) => void = () => {};
    export let onToggleIgnoreSubbed: () => void = () => {};
    export let onToggleExcludeDubbed: () => void = () => {};
    export let onToggleExcludeHDR: () => void = () => {};
    export let onResetFilters: () => void = () => {};
</script>

<div class="bg-white/5 rounded-2xl border border-white/5 p-4 flex flex-col gap-3">
    <div class="flex items-center justify-between gap-3">
        <span class="text-white text-sm font-semibold">
            Filters • {filteredCount}/{totalCount}
        </span>
        <button
            type="button"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold tracking-wide uppercase bg-white/10 text-white/80 hover:bg-white/20 transition-colors duration-200 cursor-pointer"
            on:click={onToggleFiltersCollapsed}
        >
            {filtersCollapsed ? "Expand" : "Collapse"}
            {#if filtersCollapsed}
                <ChevronDown size={14} strokeWidth={2} />
            {:else}
                <ChevronUp size={14} strokeWidth={2} />
            {/if}
        </button>
    </div>

    {#if !filtersCollapsed}
        <div class="flex flex-wrap items-center gap-2">
            <span class="text-white/70 text-sm font-semibold">Resolution</span>
            <div class="flex flex-wrap gap-2">
                {#each resolutionFilters as option}
                    <button
                        type="button"
                        class="px-3 py-1.5 rounded-full text-[11px] font-semibold tracking-wide uppercase transition-colors duration-200 {resolutionFilter ===
                        option.value
                            ? 'bg-white text-black shadow shadow-white/40'
                            : 'bg-white/10 text-white/70 hover:bg-white/20 cursor-pointer'}"
                        on:click={() => onSetResolutionFilter(option.value)}
                    >
                        {option.label}
                    </button>
                {/each}
            </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
            <span class="text-white/70 text-sm font-semibold">Provider</span>
            <div class="flex flex-wrap gap-2">
                {#each providerFilterOptions as option}
                    <button
                        type="button"
                        class="px-3 py-1.5 rounded-full text-[11px] font-semibold tracking-wide uppercase transition-colors duration-200 {providerFilter ===
                        option
                            ? 'bg-white text-black shadow shadow-white/40'
                            : 'bg-white/10 text-white/70 hover:bg-white/20 cursor-pointer'}"
                        on:click={() => onSetProviderFilter(option)}
                    >
                        {option === "all" ? "All" : option}
                    </button>
                {/each}
            </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
            <span class="text-white/70 text-sm font-semibold">Audio</span>
            <div class="flex flex-wrap gap-2">
                <button
                    type="button"
                    class="px-3 py-1.5 rounded-full text-[11px] font-semibold tracking-wide uppercase transition-colors duration-200 {audioFilter ===
                    'all'
                        ? 'bg-white text-black shadow shadow-white/40'
                        : 'bg-white/10 text-white/70 hover:bg-white/20 cursor-pointer'}"
                    on:click={() => onSetAudioFilter("all")}
                >
                    All
                </button>
                <button
                    type="button"
                    class="px-3 py-1.5 rounded-full text-[11px] font-semibold tracking-wide uppercase transition-colors duration-200 {audioFilter ===
                    'dubbed'
                        ? 'bg-white text-black shadow shadow-white/40'
                        : 'bg-white/10 text-white/70 hover:bg-white/20 cursor-pointer'}"
                    on:click={() => onSetAudioFilter("dubbed")}
                >
                    Dubbed
                </button>
                <button
                    type="button"
                    class="px-3 py-1.5 rounded-full text-[11px] font-semibold tracking-wide uppercase transition-colors duration-200 {audioFilter ===
                    'subbed'
                        ? 'bg-white text-black shadow shadow-white/40'
                        : 'bg-white/10 text-white/70 hover:bg-white/20 cursor-pointer'}"
                    on:click={() => onSetAudioFilter("subbed")}
                >
                    Subbed
                </button>
                <button
                    type="button"
                    class="px-3 py-1.5 rounded-full text-[11px] font-semibold tracking-wide uppercase transition-colors duration-200 cursor-pointer {ignoreSubbed
                        ? 'bg-[#FFDD57] text-black'
                        : 'bg-white/10 text-white/70 hover:bg-white/20'}"
                    on:click={onToggleIgnoreSubbed}
                >
                    {ignoreSubbed ? "Ignoring subbed" : "Include subbed"}
                </button>
                <button
                    type="button"
                    class="px-3 py-1.5 rounded-full text-[11px] font-semibold tracking-wide uppercase transition-colors duration-200 cursor-pointer {excludeDubbed
                        ? 'bg-[#FFDD57] text-black'
                        : 'bg-white/10 text-white/70 hover:bg-white/20'}"
                    on:click={onToggleExcludeDubbed}
                >
                    {excludeDubbed ? "Excluding dubbed" : "Include dubbed"}
                </button>
            </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
            <span class="text-white/70 text-sm font-semibold">HDR</span>
            <button
                type="button"
                class="px-3 py-1.5 rounded-full text-[11px] font-semibold tracking-wide uppercase transition-colors duration-200 cursor-pointer {excludeHDR
                    ? 'bg-[#FFDD57] text-black'
                    : 'bg-white/10 text-white/70 hover:bg-white/20'}"
                on:click={onToggleExcludeHDR}
            >
                {excludeHDR ? "Excluded" : "Include"}
            </button>
            {#if filtersActive}
                <button
                    type="button"
                    class="ml-auto text-xs text-white/50 hover:text-white/80 underline decoration-dotted cursor-pointer"
                    on:click={onResetFilters}
                >
                    Reset filters
                </button>
            {/if}
        </div>
    {/if}
</div>
