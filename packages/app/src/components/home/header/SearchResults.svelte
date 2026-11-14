<script lang="ts">
    import { fade } from "svelte/transition";
    import Skeleton from "../../common/Skeleton.svelte";
    import type { SearchTitleResult, SplitSearchResults } from "../../../lib/library/library";

    export let results: SplitSearchResults;
    export let loading = false;
    export let above = false;
    export let onOpen: (result: SearchTitleResult) => void;
    export let onContextMenu: (event: MouseEvent, result: SearchTitleResult) => void;

    $: columns = [
        { label: "Movies", items: results.movies, empty: "No movie results." },
        { label: "Series", items: results.series, empty: "No series results." },
    ];
</script>

<div
    class={`absolute left-1/2 -translate-x-1/2 w-[min(780px,76vw)] bg-[#181818]/90 backdrop-blur-xl rounded-[24px] p-4 z-100 ${
        above ? "bottom-[90px]" : "top-[90px]"
    }`}
    transition:fade={{ duration: 200 }}
>
    <div class="grid grid-cols-2 gap-4">
        {#each columns as column (column.label)}
            <div class="rounded-2xl bg-white/[0.04] p-3">
                <p class="text-white/70 text-sm font-semibold leading-normal mb-3">{column.label}</p>
                {#if loading}
                    <div class="space-y-2">
                        {#each Array(3) as _}
                            <div class="flex flex-row gap-4 items-center p-2 rounded-xl">
                                <Skeleton width="40px" height="60px" borderRadius="6px" />
                                <div class="flex flex-col gap-2">
                                    <Skeleton width="170px" height="20px" />
                                    <Skeleton width="90px" height="14px" />
                                </div>
                            </div>
                        {/each}
                    </div>
                {:else}
                    <div class="space-y-1 max-h-[360px] overflow-y-auto">
                        {#each column.items as result (result.id)}
                            <button
                                class="w-full flex flex-row gap-4 items-center p-2 hover:bg-white/10 rounded-xl transition-colors cursor-pointer text-left"
                                onclick={() => onOpen(result)}
                                oncontextmenu={(event) => {
                                    event.preventDefault();
                                    onContextMenu(event, result);
                                }}
                            >
                                <img
                                    src={result.poster || ""}
                                    alt={result.name}
                                    class="w-[40px] h-[60px] object-cover rounded-md bg-black/50"
                                />
                                <div class="flex flex-col min-w-0">
                                    <span class="text-white font-poppins font-medium text-lg line-clamp-1">{result.name}</span>
                                    <span class="text-white/50 font-poppins text-sm line-clamp-1">{result.year || result.releaseInfo || ""}</span>
                                </div>
                            </button>
                        {:else}
                            <p class="text-white/45 text-sm px-2 py-3">{column.empty}</p>
                        {/each}
                    </div>
                {/if}
            </div>
        {/each}
    </div>
</div>
