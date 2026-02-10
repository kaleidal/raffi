<script lang="ts">
    import { onMount } from "svelte";
    import { fade } from "svelte/transition";
    import { getCachedMetaData } from "../lib/library/metaCache";
    import { getPopularTitles } from "../lib/library/library";
    import {
        fetchAddonHomeSections,
        fetchHeroTitlesFromCatalogSource,
        getHeroCatalogSourceOptions,
        type HeroCatalogSourceOption,
    } from "../lib/library/addonCatalogs";
    import type { ShowResponse } from "../lib/library/types/meta_types";
    import type { PopularTitleMeta } from "../lib/library/types/popular_types";
    import {
        getAddons,
        getLibrary,
        updateLibraryPoster,
        type Addon,
    } from "../lib/db/db";
    import {
        getStoredHomeHeroSource,
        HOME_HERO_SOURCE_CINEMETA,
    } from "../lib/home/heroSettings";

    import Hero from "../components/home/Hero.svelte";
    import SearchBar from "../components/home/SearchBar.svelte";
    import ContinueWatching from "../components/home/sections/ContinueWatching.svelte";
    import AddonsModal from "../components/home/modals/AddonsModal.svelte";
    import SettingsModal from "../components/home/modals/SettingsModal.svelte";
    import PopularSection from "../components/home/sections/PopularSection.svelte";
    import GenreSection from "../components/home/sections/GenreSection.svelte";
    import LoadingSpinner from "../components/common/LoadingSpinner.svelte";
    import Skeleton from "../components/common/Skeleton.svelte";

    let showcasedTitle: PopularTitleMeta;
    let fetchedTitles = false;
    let continueWatchingMeta: (ShowResponse & { libraryItem: any })[] = [];
    let popularMeta: PopularTitleMeta[] = [];
    let showAddonsModal = false;
    let showSettingsModal = false;
    let genreMap: Record<string, PopularTitleMeta[]> = {};
    let topGenres: string[] = [];
    let absolutePopularTitles: PopularTitleMeta[] = [];
    let heroPoolTitles: PopularTitleMeta[] = [];
    let addonSections: { id: string; title: string; titles: PopularTitleMeta[] }[] =
        [];
    let addonSectionsLoading = false;
    const HOME_REFRESH_EVENT = "raffi:home-refresh";

    function isHeroCandidate(title: PopularTitleMeta) {
        const year = parseInt(title.year ?? "");
        return (
            Boolean(title.logo) &&
            Array.isArray(title.trailerStreams) &&
            title.trailerStreams.length > 0 &&
            year >= 2010
        );
    }

    function chooseRandom(items: PopularTitleMeta[]) {
        if (items.length === 0) return undefined;
        return items[Math.floor(Math.random() * items.length)];
    }

    function setFeaturedFromPool() {
        const primaryCandidates = heroPoolTitles.filter(isHeroCandidate);
        if (primaryCandidates.length > 0) {
            const selected = chooseRandom(primaryCandidates);
            if (selected) showcasedTitle = selected;
            return;
        }

        const fallbackCandidates = absolutePopularTitles.filter(isHeroCandidate);
        if (fallbackCandidates.length > 0) {
            const selected = chooseRandom(fallbackCandidates);
            if (selected) showcasedTitle = selected;
            return;
        }

        const looseFallback = chooseRandom(heroPoolTitles) ?? chooseRandom(absolutePopularTitles);
        if (looseFallback) showcasedTitle = looseFallback;
    }

    async function refreshFeatured() {
        setFeaturedFromPool();
    }

    async function loadContinueWatching() {
        const nextContinueWatchingMeta: (ShowResponse & { libraryItem: any })[] = [];
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
                        nextContinueWatchingMeta.push({
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

                        nextContinueWatchingMeta.push({
                            ...meta,
                            libraryItem: item,
                        });
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
        continueWatchingMeta = nextContinueWatchingMeta;
    }

    async function refreshAddonSections(installedAddons?: Addon[]) {
        addonSectionsLoading = true;
        try {
            const addons = installedAddons ?? (await getAddons());
            addonSections = await fetchAddonHomeSections(addons);
        } catch (e) {
            console.error("Failed to refresh addon sections", e);
            addonSections = [];
        } finally {
            addonSectionsLoading = false;
        }
    }

    async function refreshHeroSourcePool(installedAddons?: Addon[]) {
        try {
            const addons = installedAddons ?? (await getAddons());
            const selectedSourceId = getStoredHomeHeroSource();
            const heroOptions: HeroCatalogSourceOption[] =
                getHeroCatalogSourceOptions(addons);

            if (selectedSourceId !== HOME_HERO_SOURCE_CINEMETA) {
                const selectedOption = heroOptions.find(
                    (option) => option.id === selectedSourceId,
                );
                if (selectedOption) {
                    const addonHeroTitles = await fetchHeroTitlesFromCatalogSource(
                        selectedOption,
                    );
                    if (addonHeroTitles.length > 0) {
                        heroPoolTitles = addonHeroTitles;
                        setFeaturedFromPool();
                        return;
                    }
                }
            }

            heroPoolTitles = absolutePopularTitles;
            setFeaturedFromPool();
        } catch (e) {
            console.error("Failed to refresh hero source", e);
            heroPoolTitles = absolutePopularTitles;
            setFeaturedFromPool();
        }
    }

    onMount(() => {
        const loadHomeData = async () => {
            const [mostPopularMovies, mostPopularSeries, installedAddons] =
                await Promise.all([
                    getPopularTitles("movie"),
                    getPopularTitles("series"),
                    getAddons().catch(() => []),
                ]);
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

            await refreshHeroSourcePool(installedAddons);
            await loadContinueWatching();

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

            void refreshAddonSections(installedAddons);
            fetchedTitles = true;
        };

        void loadHomeData();

        const handleHomeRefresh = async () => {
            const installedAddons = await getAddons().catch(() => [] as Addon[]);
            await Promise.all([
                loadContinueWatching(),
                refreshAddonSections(installedAddons),
                refreshHeroSourcePool(installedAddons),
            ]);
        };
        window.addEventListener(HOME_REFRESH_EVENT, handleHomeRefresh);

        return () => {
            window.removeEventListener(HOME_REFRESH_EVENT, handleHomeRefresh);
        };
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

                {#each addonSections as section (section.id)}
                    <GenreSection genre={section.title} titles={section.titles} />
                {/each}

                {#if addonSectionsLoading}
                    {#each Array(2) as _}
                        <div class="w-full h-fit flex flex-col gap-4">
                            <Skeleton width="460px" height="58px" borderRadius="14px" />
                            <div class="flex flex-row gap-[20px] overflow-hidden pb-6 pt-3">
                                {#each Array(7) as __}
                                    <Skeleton
                                        width="200px"
                                        height="300px"
                                        borderRadius="16px"
                                    />
                                {/each}
                            </div>
                        </div>
                    {/each}
                {/if}

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
