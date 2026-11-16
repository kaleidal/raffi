<script lang="ts">
    import { untrack } from "svelte";
    import Segmented from "../../common/controls/Segmented.svelte";
    import ChipRail from "../../common/ChipRail.svelte";
    import Skeleton from "../../common/Skeleton.svelte";
    import PosterCard from "./PosterCard.svelte";
    import { BROWSE_GENRES, BROWSE_PAGE_SIZE, fetchBrowsePage, type BrowseType } from "../../../lib/library/browseCatalog";
    import { BROWSE_SECTION_ID, browseSelection } from "../../../lib/home/browse";
    import { uniqueTitles } from "../../../lib/home/homeRows";
    import type { PopularTitleMeta } from "../../../lib/library/types/popular_types";

    const types: ReadonlyArray<{ value: BrowseType; label: string }> = [
        { value: "movie", label: "Movies" },
        { value: "series", label: "Shows" },
    ];

    let titles = $state<PopularTitleMeta[]>([]);
    let loading = $state(false);
    let exhausted = $state(false);
    let failed = $state(false);
    let request = 0;

    const genres = $derived(BROWSE_GENRES[$browseSelection.type]);

    async function loadMore(reset: boolean) {
        if (!reset && (loading || exhausted)) return;
        const token = ++request;
        const { type, genre } = $browseSelection;
        loading = true;
        failed = false;
        try {
            const page = await fetchBrowsePage(type, genre, reset ? 0 : titles.length);
            if (token !== request) return;
            titles = uniqueTitles(reset ? page : [...titles, ...page]);
            exhausted = page.length < BROWSE_PAGE_SIZE;
        } catch (error) {
            if (token !== request) return;
            console.error("Failed to load browse titles", error);
            failed = true;
        } finally {
            if (token === request) loading = false;
        }
    }

    $effect(() => {
        $browseSelection;
        untrack(() => {
            titles = [];
            exhausted = false;
            void loadMore(true);
        });
    });

    function loadWhenNear(node: HTMLElement) {
        const observer = new IntersectionObserver(
            (entries) => entries.some((entry) => entry.isIntersecting) && void loadMore(false),
            { rootMargin: "1200px 0px" },
        );
        observer.observe(node);
        return { destroy: () => observer.disconnect() };
    }

    function choose(type: BrowseType, genre: string | null) {
        browseSelection.set({ type, genre: genre && BROWSE_GENRES[type].includes(genre) ? genre : null });
    }

    const tab = "shrink-0 cursor-pointer rounded-full px-4 py-2 text-[clamp(14px,0.95vw,17px)] font-medium transition-colors duration-200";
</script>

<section id={BROWSE_SECTION_ID} class="flex scroll-mt-8 flex-col gap-5">
    <div class="flex flex-wrap items-center justify-between gap-4">
        <h2 class="text-[clamp(28px,2.2vw,44px)] font-semibold text-ink">Browse</h2>
        <Segmented
            value={$browseSelection.type}
            options={types}
            label="Movies or shows"
            onChange={(type) => choose(type, $browseSelection.genre)}
        />
    </div>

    <ChipRail>
        {#each [null, ...genres] as genre (genre ?? "popular")}
            <button
                class="{tab} {$browseSelection.genre === genre ? 'bg-accent text-on-accent' : 'bg-ink/8 text-ink/75 hover:bg-ink/14 hover:text-ink'}"
                onclick={(event) => {
                    choose($browseSelection.type, genre);
                    event.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
                }}
            >
                {genre ?? "Popular"}
            </button>
        {/each}
    </ChipRail>

    <div class="browse-grid grid gap-[clamp(14px,1.2vw,22px)] pt-2">
        {#each titles as title (title.imdb_id)}
            <PosterCard {title} class="w-full" />
        {/each}
        {#if loading}
            {#each Array(12) as _, index (index)}
                <Skeleton width="100%" height="auto" borderRadius="16px" />
            {/each}
        {/if}
    </div>

    {#if failed}
        <button class="self-center cursor-pointer rounded-full bg-ink/10 px-5 py-2.5 font-medium text-ink hover:bg-ink/16" onclick={() => loadMore(titles.length === 0)}>
            Try again
        </button>
    {:else if !exhausted && !loading}
        {#key titles.length}
            <div use:loadWhenNear class="h-px"></div>
        {/key}
    {/if}
</section>

<style>
    .browse-grid {
        grid-template-columns: repeat(auto-fill, minmax(clamp(130px, 10.5vw, 200px), 1fr));
    }

    .browse-grid :global(.skeleton) {
        aspect-ratio: 2 / 3;
    }
</style>
