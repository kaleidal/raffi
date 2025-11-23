<script lang="ts">
    import { onMount } from "svelte";
    import { fade } from "svelte/transition";
    import { getMetaData, getPopularTitles } from "../lib/library/library";
    import type { ShowResponse } from "../lib/library/types/meta_types";
    import type { PopularTitleMeta } from "../lib/library/types/popular_types";
    import { getLibrary } from "../lib/db/db";

    import Hero from "../components/home/Hero.svelte";
    import SearchBar from "../components/home/SearchBar.svelte";
    import ContinueWatching from "../components/home/sections/ContinueWatching.svelte";
    import AddonsModal from "../components/AddonsModal.svelte";
    import PopularSection from "../components/home/sections/PopularSection.svelte";
    import GenreSection from "../components/home/sections/GenreSection.svelte";
    import LoadingSpinner from "../components/common/LoadingSpinner.svelte";

    let showcasedTitle: PopularTitleMeta;
    let fetchedTitles = false;
    let continueWatchingMeta: (ShowResponse & { libraryItem: any })[] = [];
    let popularMeta: PopularTitleMeta[] = [];
    let showAddonsModal = false;
    let genreMap: Record<string, PopularTitleMeta[]> = {};
    let topGenres: string[] = [];

    async function checkTrailer(videoId: string): Promise<boolean> {
        try {
            const response = await fetch(
                `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`,
            );
            const data = await response.json();
            if (data.error) return false;
            return true;
        } catch (e) {
            return false;
        }
    }

    onMount(async () => {
        let randomType = Math.random() < 0.5 ? "series" : "movie";
        let mostPopularTitles = await getPopularTitles(randomType);

        let attempts = 0;
        const maxAttempts = 10;

        while (attempts < maxAttempts) {
            let randomIndex = Math.floor(
                Math.random() * mostPopularTitles.length,
            );
            let randomTitle = mostPopularTitles[randomIndex];

            const year = parseInt(randomTitle.year ?? "");
            if (!year || year < 2010) {
                attempts++;
                continue;
            }

            if (
                randomTitle.trailerStreams &&
                randomTitle.trailerStreams.length > 0 &&
                randomTitle.trailerStreams[0] &&
                randomTitle.logo != undefined
            ) {
                const isPlayable = await checkTrailer(
                    randomTitle.trailerStreams[0].ytId,
                );
                if (isPlayable) {
                    showcasedTitle = randomTitle;
                    break;
                }
            }
            attempts++;
        }

        if (!showcasedTitle) {
            const fallback = mostPopularTitles.find(
                (t) => t.trailerStreams && t.trailerStreams.length > 0,
            );
            if (fallback) showcasedTitle = fallback;
        }

        try {
            const library = await getLibrary();
            library.sort(
                (a, b) =>
                    new Date(b.last_watched).getTime() -
                    new Date(a.last_watched).getTime(),
            );

            const recent = library
                .filter((item) => item.shown !== false)
                .slice(0, 10);
            for (const item of recent) {
                try {
                    let meta: ShowResponse;
                    console.log(
                        "Fetching meta for:",
                        item.imdb_id,
                        "Type:",
                        item.type,
                    );
                    if (item.type) {
                        meta = await getMetaData(item.imdb_id, item.type);
                    } else {
                        try {
                            meta = await getMetaData(item.imdb_id, "series");
                        } catch {
                            meta = await getMetaData(item.imdb_id, "movie");
                        }
                    }
                    if (meta && meta.meta) {
                        continueWatchingMeta.push({
                            ...meta,
                            libraryItem: item,
                        });
                        continueWatchingMeta = continueWatchingMeta;
                    } else {
                        console.warn("No meta found for:", item.imdb_id);
                    }
                } catch (e) {
                    console.error(`Failed to load meta for ${item.imdb_id}`, e);
                }
            }
        } catch (e) {
            console.error("Failed to load library", e);
        }

        let absolutePopularTitles = [];
        let mostPopularMovies = await getPopularTitles("movie");
        let mostPopularSeries = await getPopularTitles("series");
        absolutePopularTitles = [...mostPopularMovies, ...mostPopularSeries];

        if (absolutePopularTitles.length > 0) {
            absolutePopularTitles.sort(
                (a, b) =>
                    (b.popularities.moviedb || 0) -
                    (a.popularities.moviedb || 0),
            );

            absolutePopularTitles = absolutePopularTitles.slice(0, 20);

            popularMeta = absolutePopularTitles;
        }

        const allTitlesForGenres = [...mostPopularMovies, ...mostPopularSeries];
        const genreCount: Record<string, number> = {};

        for (const title of allTitlesForGenres) {
            if (title.genre && Array.isArray(title.genre)) {
                for (const g of title.genre) {
                    if (!genreMap[g]) {
                        genreMap[g] = [];
                        genreCount[g] = 0;
                    }
                    genreMap[g].push(title);
                    genreCount[g]++;
                }
            }
        }

        topGenres = Object.entries(genreCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([genre]) => genre);

        fetchedTitles = true;
    });

    function handleOpenAddons() {
        showAddonsModal = true;
    }
</script>

<div class="bg-[#090909] h-fit min-h-screen flex flex-col pb-[100px]">
    {#if fetchedTitles}
        <div in:fade={{ duration: 300 }}>
            {#if showcasedTitle}
                <Hero {showcasedTitle} />
            {/if}

            <SearchBar
                on:openAddons={handleOpenAddons}
                on:openProfile={() => {}}
            />

            <div
                class="w-full z-10 h-fit flex flex-col gap-[100px] p-[100px] pt-[50px]"
            >
                <ContinueWatching {continueWatchingMeta} />
                <PopularSection {popularMeta} />

                {#each topGenres as genre}
                    <GenreSection {genre} titles={genreMap[genre]} />
                {/each}
            </div>

            <AddonsModal bind:showAddonsModal />
        </div>
    {:else}
        <div
            class="w-full h-screen flex items-center justify-center"
            out:fade={{ duration: 200 }}
        >
            <LoadingSpinner size="60px" />
        </div>
    {/if}
</div>
