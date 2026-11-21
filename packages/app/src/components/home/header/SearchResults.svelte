<script lang="ts">
    import { fade } from "svelte/transition";
    import Segmented from "../../common/controls/Segmented.svelte";
    import Skeleton from "../../common/loading/Skeleton.svelte";
    import PosterImage from "../sections/PosterImage.svelte";
    import type { SearchTitleResult, SplitSearchResults } from "../../../lib/library/titleSearch";

    type Kind = "movies" | "series";

    let {
        query,
        results,
        loading = false,
        above = false,
        onOpen,
        onContextMenu,
    }: {
        query: string;
        results: SplitSearchResults;
        loading?: boolean;
        above?: boolean;
        onOpen: (result: SearchTitleResult) => void;
        onContextMenu: (event: MouseEvent, result: SearchTitleResult) => void;
    } = $props();

    let picked = $state<Kind | null>(null);

    const matchScore = (result: SearchTitleResult | undefined) => {
        if (!result) return 0;
        const name = result.name.toLowerCase();
        const wanted = query.trim().toLowerCase();
        return name === wanted ? 3 : name.startsWith(wanted) ? 2 : name.includes(wanted) ? 1 : 0;
    };

    const bestKind = $derived<Kind>(
        results.movies.length === 0 || matchScore(results.series[0]) > matchScore(results.movies[0]) ? "series" : "movies",
    );
    const kind = $derived(picked && results[picked].length > 0 ? picked : bestKind);
    const options = [
        { value: "movies" as const, label: "Movies" },
        { value: "series" as const, label: "Series" },
    ];
</script>

<div
    class="search-results absolute left-1/2 z-100 flex -translate-x-1/2 flex-col gap-4 rounded-[28px] bg-raised/85 p-5 text-ink shadow-[0_30px_90px_rgba(0,0,0,0.45)] backdrop-blur-2xl"
    class:above
    transition:fade={{ duration: 180 }}
>
    <div class="self-start">
        <Segmented value={kind} {options} label="Result type" onChange={(value) => (picked = value)} />
    </div>

    <div class="grid max-h-[min(60vh,620px)] grid-cols-[repeat(auto-fill,minmax(clamp(112px,8.5vw,148px),1fr))] gap-x-4 gap-y-5 overflow-y-auto pr-1">
        {#if loading}
            {#each Array(6) as _}
                <div class="flex flex-col gap-2">
                    <div class="aspect-[2/3] w-full"><Skeleton width="100%" height="100%" borderRadius="14px" /></div>
                    <Skeleton width="80%" height="14px" />
                </div>
            {/each}
        {:else}
            {#each results[kind] as result (result.id)}
                <button
                    class="group flex cursor-pointer flex-col gap-2 text-left"
                    onclick={() => onOpen(result)}
                    oncontextmenu={(event) => {
                        event.preventDefault();
                        onContextMenu(event, result);
                    }}
                >
                    <span class="block aspect-[2/3] w-full overflow-hidden rounded-[14px] transition-[translate] duration-200 group-hover:-translate-y-1">
                        <PosterImage src={result.poster} title={result.name} alt="" />
                    </span>
                    <span class="flex min-w-0 flex-col">
                        <span class="truncate text-[15px] font-medium">{result.name}</span>
                        <span class="text-sm text-ink/50">{result.year || result.releaseInfo || ""}</span>
                    </span>
                </button>
            {/each}
        {/if}
    </div>
</div>

<style>
    .search-results {
        top: calc(100% + 14px);
        width: min(1040px, 90vw);
    }

    .search-results.above {
        top: auto;
        bottom: calc(100% + 14px);
    }
</style>
