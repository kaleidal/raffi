<script lang="ts">
    import { onMount } from "svelte";
    import { fade } from "svelte/transition";
    import { getCachedMetaData } from "../lib/library/metaCache";
    import { getPopularTitles } from "../lib/library/library";
    import type { ShowResponse } from "../lib/library/types/meta_types";
    import type { PopularTitleMeta } from "../lib/library/types/popular_types";
    import { getLibrary, updateLibraryPoster } from "../lib/db/db";

    import Hero from "../components/home/Hero.svelte";
    import SearchBar from "../components/home/SearchBar.svelte";
    import ContinueWatching from "../components/home/sections/ContinueWatching.svelte";
    import AddonsModal from "../components/home/modals/AddonsModal.svelte";
    import SettingsModal from "../components/home/modals/SettingsModal.svelte";
    import PopularSection from "../components/home/sections/PopularSection.svelte";
    import GenreSection from "../components/home/sections/GenreSection.svelte";
    import LoadingSpinner from "../components/common/LoadingSpinner.svelte";

    let showcasedTitle: PopularTitleMeta;
    let fetchedTitles = false;
    let continueWatchingMeta: (ShowResponse & { libraryItem: any })[] = [];
    let popularMeta: PopularTitleMeta[] = [];
    let showAddonsModal = false;
    let showSettingsModal = false;
    let genreMap: Record<string, PopularTitleMeta[]> = {};
    let topGenres: string[] = [];
    let absolutePopularTitles: PopularTitleMeta[] = [];

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

    async function refreshFeatured() {
        if (absolutePopularTitles.length === 0) return;

        let attempts = 0;
        const maxAttempts = 10;
        let newTitle: PopularTitleMeta | undefined;

        while (attempts < maxAttempts) {
            let randomIndex = Math.floor(
                Math.random() * absolutePopularTitles.length,
            );
            let randomTitle = absolutePopularTitles[randomIndex];

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
                    newTitle = randomTitle;
                    break;
                }
            }
            attempts++;
        }

        if (!newTitle) {
            const fallback = absolutePopularTitles.find(
                (t) => t.trailerStreams && t.trailerStreams.length > 0,
            );
            if (fallback) newTitle = fallback;
        }

        if (newTitle) showcasedTitle = newTitle;
    }

    onMount(async () => {
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

        await refreshFeatured();

        try {
            const library = await getLibrary();
            library.sort(
                (a, b) =>
                    new Date(b.last_watched).getTime() -
                    new Date(a.last_watched).getTime(),
            );

            const recent = library.filter(
                (item) => item.shown !== false && !item.completed_at,
            );
            for (const item of recent) {
                try {
                    if (item.poster) {
                        continueWatchingMeta.push({
                            meta: {
                                poster: item.poster,
                                imdb_id: item.imdb_id,
                                type: item.type,
                                name: "",
                                id: item.imdb_id,
                                genres: [],
                                releaseInfo: "",
                                description: "",
                                cast: [],
                                videos: [],
                                popularities: {} as any,
                            } as any,
                            libraryItem: item,
                        });
                        continueWatchingMeta = continueWatchingMeta;
                        continue;
                    }

                    let meta: ShowResponse;
                    if (item.type) {
                        meta = await getCachedMetaData(item.imdb_id, item.type);
                    } else {
                        try {
                            meta = await getCachedMetaData(
                                item.imdb_id,
                                "series",
                            );
                        } catch {
                            meta = await getCachedMetaData(
                                item.imdb_id,
                                "movie",
                            );
                        }
                    }

                    if (meta && meta.meta) {
                        if (!item.poster && meta.meta.poster) {
                            try {
                                await updateLibraryPoster(
                                    item.imdb_id,
                                    meta.meta.poster,
                                );
                                item.poster = meta.meta.poster;
                            } catch (e) {
                                console.error("Failed to backfill poster", e);
                            }
                        }

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

    function handleOpenSettings() {
        showSettingsModal = true;
    }
</script>

<div class="bg-[#090909] h-fit min-h-screen flex flex-col pb-[100px]">
    {#if fetchedTitles}
        <div in:fade={{ duration: 300 }}>
            {#if showcasedTitle}
                <Hero {showcasedTitle} on:logoError={refreshFeatured} />
            {/if}

            <SearchBar
                on:openAddons={handleOpenAddons}
                on:openSettings={handleOpenSettings}
                on:openProfile={() => {}}
                onLogoClick={refreshFeatured}
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
            <SettingsModal bind:showSettings={showSettingsModal} />
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
