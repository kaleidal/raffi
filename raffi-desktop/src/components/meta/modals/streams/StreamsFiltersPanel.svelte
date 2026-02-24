<script lang="ts">
    import { createEventDispatcher } from "svelte";
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

    const dispatch = createEventDispatcher();
</script>

<div class="bg-white/5 rounded-2xl border border-white/5 p-4 flex flex-col gap-3">
    <div class="flex items-center justify-between gap-3">
        <span class="text-white text-sm font-semibold">
            Filters • {filteredCount}/{totalCount}
        </span>
        <button
            type="button"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold tracking-wide uppercase bg-white/10 text-white/80 hover:bg-white/20 transition-colors duration-200 cursor-pointer"
            on:click={() => dispatch("toggleFiltersCollapsed")}
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
                        on:click={() => dispatch("setResolutionFilter", option.value)}
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
                        on:click={() => dispatch("setProviderFilter", option)}
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
                    on:click={() => dispatch("setAudioFilter", "all")}
                >
                    All
                </button>
                <button
                    type="button"
                    class="px-3 py-1.5 rounded-full text-[11px] font-semibold tracking-wide uppercase transition-colors duration-200 {audioFilter ===
                    'dubbed'
                        ? 'bg-white text-black shadow shadow-white/40'
                        : 'bg-white/10 text-white/70 hover:bg-white/20 cursor-pointer'}"
                    on:click={() => dispatch("setAudioFilter", "dubbed")}
                >
                    Dubbed
                </button>
                <button
                    type="button"
                    class="px-3 py-1.5 rounded-full text-[11px] font-semibold tracking-wide uppercase transition-colors duration-200 {audioFilter ===
                    'subbed'
                        ? 'bg-white text-black shadow shadow-white/40'
                        : 'bg-white/10 text-white/70 hover:bg-white/20 cursor-pointer'}"
                    on:click={() => dispatch("setAudioFilter", "subbed")}
                >
                    Subbed
                </button>
                <button
                    type="button"
                    class="px-3 py-1.5 rounded-full text-[11px] font-semibold tracking-wide uppercase transition-colors duration-200 cursor-pointer {ignoreSubbed
                        ? 'bg-[#FFDD57] text-black'
                        : 'bg-white/10 text-white/70 hover:bg-white/20'}"
                    on:click={() => dispatch("toggleIgnoreSubbed")}
                >
                    {ignoreSubbed ? "Ignoring subbed" : "Include subbed"}
                </button>
                <button
                    type="button"
                    class="px-3 py-1.5 rounded-full text-[11px] font-semibold tracking-wide uppercase transition-colors duration-200 cursor-pointer {excludeDubbed
                        ? 'bg-[#FFDD57] text-black'
                        : 'bg-white/10 text-white/70 hover:bg-white/20'}"
                    on:click={() => dispatch("toggleExcludeDubbed")}
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
                on:click={() => dispatch("toggleExcludeHDR")}
            >
                {excludeHDR ? "Excluded" : "Include"}
            </button>
            {#if filtersActive}
                <button
                    type="button"
                    class="ml-auto text-xs text-white/50 hover:text-white/80 underline decoration-dotted cursor-pointer"
                    on:click={() => dispatch("resetFilters")}
                >
                    Reset filters
                </button>
            {/if}
        </div>
    {/if}
</div>
