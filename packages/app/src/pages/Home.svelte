<script lang="ts">
    import { onMount } from "svelte";
    import { fade } from "svelte/transition";
    import { getPopularTitles } from "../lib/library/library";
    import { sanitizeCatalogTitles } from "../lib/library/catalogQuality";
    import {
        fetchAddonHomeSections,
        fetchHeroTitlesFromCatalogSource,
        getHeroCatalogSourceOptions,
        type HeroCatalogSourceOption,
    } from "../lib/library/addonCatalogs";
    import type { PopularTitleMeta } from "../lib/library/types/popular_types";
    import {
        getAddons,
        getTraktStatus,
        getLibrary,
        type Addon,
    } from "../lib/db/db";
    import {
        getStoredHomeHeroSource,
        HOME_HERO_SOURCE_CINEMETA,
        HOME_HERO_SOURCE_TRAKT_RECOMMENDATIONS,
    } from "../lib/home/heroSettings";
    import { mapWithConcurrency } from "../lib/utils/mapWithConcurrency";
    import { loadWatchingItem, type LoadedWatchingItem } from "../lib/home/continueWatching";

    import Hero from "../components/home/Hero.svelte";
    import SearchBar from "../components/home/SearchBar.svelte";
    import ContinueWatching from "../components/home/sections/ContinueWatching.svelte";
    import TitleRow from "../components/home/sections/TitleRow.svelte";
    import { fetchRecommendedTitles, uniqueTitles } from "../lib/home/homeRows";
    import { pickHeroTitle, pickSpotlight } from "../lib/home/featured";
    import { homeAmbient } from "../lib/home/ambient";
    import { BROWSE_SECTION_ID, browseSelection } from "../lib/home/browse";
    import BrowseSection from "../components/home/sections/BrowseSection.svelte";
    import TitleMenuHost from "../components/home/TitleMenuHost.svelte";
    import AmbientBackdrop from "../components/common/AmbientBackdrop.svelte";
    import FeatureStrip from "../components/common/FeatureStrip.svelte";
    import { router } from "../lib/stores/router";
    import { getPrimaryTrailerId } from "../lib/home/trailers";
    import { isAndroidPlatform } from "../lib/shell/platform";
    import LoadingSpinner from "../components/common/LoadingSpinner.svelte";
    import TitleRowSkeleton from "../components/home/sections/TitleRowSkeleton.svelte";

    let showcasedTitle: PopularTitleMeta | null = null;
    let fetchedTitles = false;
    let continueWatchingMeta: LoadedWatchingItem[] = [];
    let popularMeta: PopularTitleMeta[] = [];
    let absolutePopularTitles: PopularTitleMeta[] = [];
    let heroPoolTitles: PopularTitleMeta[] = [];
    let addonSections: { id: string; title: string; titles: PopularTitleMeta[] }[] =
        [];
    let traktRecommendations: PopularTitleMeta[] = [];
    let traktRecommendationsConnected = false;
    let spotlight: PopularTitleMeta | null = null;
    $: spotlight = pickSpotlight(
        [traktRecommendations, ...addonSections.map((section) => section.titles), popularMeta],
        showcasedTitle?.imdb_id,
        spotlight,
    );

    function seeAllPopular() {
        browseSelection.update((selection) => ({ ...selection, genre: null }));
        document.getElementById(BROWSE_SECTION_ID)?.scrollIntoView({ behavior: "smooth" });
    }
    let addonSectionsLoading = false;
    let continueWatchingLoadGeneration = 0;
    const HOME_REFRESH_EVENT = "raffi:home-refresh";

    async function loadTraktRecommendations() {
        try {
            const status = await getTraktStatus();
            traktRecommendationsConnected = Boolean(status.connected && status.configured);
            if (!traktRecommendationsConnected) {
                traktRecommendations = [];
                return;
            }

            traktRecommendations = await fetchRecommendedTitles();
        } catch (error) {
            console.error("Failed to load Trakt recommendations", error);
            traktRecommendations = [];
            traktRecommendationsConnected = false;
        }
    }

    function setFeaturedFromPool(options: { preserveCurrent?: boolean } = {}) {
        const selected = pickHeroTitle(
            heroPoolTitles,
            absolutePopularTitles,
            showcasedTitle,
            getStoredHomeHeroSource(),
            options,
        );
        if (selected) showcasedTitle = selected;
    }

    async function refreshFeatured() {
        setFeaturedFromPool();
    }

    async function loadContinueWatching() {
        const generation = ++continueWatchingLoadGeneration;
        const previousById = new Map(
            continueWatchingMeta.map((item) => [item.meta.imdb_id, item]),
        );
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
            const loadedItems: Array<LoadedWatchingItem | null> = [];
            for (let offset = 0; offset < recent.length; offset += 24) {
                const batch = await mapWithConcurrency(recent.slice(offset, offset + 24), 6, (item) =>
                    loadWatchingItem(item, previousById.get(item.imdb_id)),
                );
                loadedItems.push(...batch);
                if (
                    generation === continueWatchingLoadGeneration &&
                    offset === 0 &&
                    continueWatchingMeta.length === 0
                ) {
                    continueWatchingMeta = loadedItems.filter(
                        (item): item is LoadedWatchingItem => item !== null,
                    );
                }
            }
            if (generation === continueWatchingLoadGeneration) {
                continueWatchingMeta = loadedItems.filter(
                    (item): item is LoadedWatchingItem => item !== null,
                );
            }
        } catch (e) {
            console.error("Failed to load library", e);
        }
    }

    async function refreshAddonSections(installedAddons?: Addon[]) {
        addonSectionsLoading = true;
        try {
            const addons = installedAddons ?? (await getAddons());
            addonSections = (await fetchAddonHomeSections(addons))
                .map((section) => ({
                    ...section,
                    titles: sanitizeCatalogTitles(section.titles),
                }))
                .filter((section) => section.titles.length > 0);
        } catch (e) {
            console.error("Failed to refresh addon sections", e);
            addonSections = [];
        } finally {
            addonSectionsLoading = false;
        }
    }

    async function refreshHeroSourcePool(
        installedAddons?: Addon[],
        options: { preserveCurrent?: boolean } = {},
    ) {
        try {
            const addons = installedAddons ?? (await getAddons());
            const selectedSourceId = getStoredHomeHeroSource();
            const heroOptions: HeroCatalogSourceOption[] =
                getHeroCatalogSourceOptions(addons);

            if (selectedSourceId === HOME_HERO_SOURCE_TRAKT_RECOMMENDATIONS) {
                if (traktRecommendations.length === 0) {
                    await loadTraktRecommendations();
                }
                if (traktRecommendations.length > 0) {
                    heroPoolTitles = traktRecommendations;
                    setFeaturedFromPool(options);
                    return;
                }
            }

            if (selectedSourceId !== HOME_HERO_SOURCE_CINEMETA) {
                const selectedOption = heroOptions.find(
                    (option) => option.id === selectedSourceId,
                );
                if (selectedOption) {
                    const addonHeroTitles = await fetchHeroTitlesFromCatalogSource(
                        selectedOption,
                    );
                    const sanitizedHeroTitles = sanitizeCatalogTitles(addonHeroTitles);
                    if (sanitizedHeroTitles.length > 0) {
                        heroPoolTitles = sanitizedHeroTitles;
                        setFeaturedFromPool(options);
                        return;
                    }
                }
            }

            heroPoolTitles = absolutePopularTitles;
            setFeaturedFromPool(options);
        } catch (e) {
            console.error("Failed to refresh hero source", e);
            heroPoolTitles = absolutePopularTitles;
            setFeaturedFromPool(options);
        }
    }

    function applyPopularData(
        mostPopularMovies: PopularTitleMeta[],
        mostPopularSeries: PopularTitleMeta[],
    ) {
        const sanitizedMovies = sanitizeCatalogTitles(mostPopularMovies);
        const sanitizedSeries = sanitizeCatalogTitles(mostPopularSeries);
        absolutePopularTitles = sanitizeCatalogTitles([
            ...sanitizedMovies,
            ...sanitizedSeries,
        ]);

        if (absolutePopularTitles.length > 0) {
            absolutePopularTitles.sort(
                (a, b) =>
                    (b.popularities.moviedb || 0) -
                    (a.popularities.moviedb || 0),
            );

            absolutePopularTitles = absolutePopularTitles.slice(0, 20);
            popularMeta = uniqueTitles(absolutePopularTitles);
        }

    }

    async function refreshPersonalHomeSections(
        installedAddons?: Addon[],
        options: { preserveHero?: boolean } = {},
    ) {
        const selectedSourceId = getStoredHomeHeroSource();
        void loadContinueWatching();
        void refreshAddonSections(installedAddons);
        const heroOptions = { preserveCurrent: options.preserveHero };
        const heroWaitsForTrakt = selectedSourceId === HOME_HERO_SOURCE_TRAKT_RECOMMENDATIONS;
        void loadTraktRecommendations().then(() => {
            if (heroWaitsForTrakt) void refreshHeroSourcePool(installedAddons, heroOptions);
        });
        if (!heroWaitsForTrakt) void refreshHeroSourcePool(installedAddons, heroOptions);
    }

    onMount(() => {
        void loadContinueWatching();

        const loadHomeData = async () => {
            try {
                const [mostPopularMovies, mostPopularSeries, installedAddons] =
                    await Promise.all([
                        getPopularTitles("movie"),
                        getPopularTitles("series"),
                        getAddons().catch(() => []),
                    ]);

                applyPopularData(mostPopularMovies, mostPopularSeries);
                fetchedTitles = true;
                void refreshPersonalHomeSections(installedAddons);
            } catch (error) {
                console.error("Failed to load home data", error);
                fetchedTitles = true;
                void refreshPersonalHomeSections();
            }
        };

        void loadHomeData();

        const handleHomeRefresh = async (event: Event) => {
            const installedAddons = await getAddons().catch(() => [] as Addon[]);
            const preserveHero = event instanceof CustomEvent
                ? event.detail?.preserveHero !== false
                : true;
            void refreshPersonalHomeSections(installedAddons, { preserveHero });
        };
        window.addEventListener(HOME_REFRESH_EVENT, handleHomeRefresh);

        return () => {
            window.removeEventListener(HOME_REFRESH_EVENT, handleHomeRefresh);
        };
    });


</script>

<div class="bg-canvas h-fit min-h-screen flex flex-col pb-[clamp(64px,7vw,100px)]">
    <AmbientBackdrop src={$homeAmbient} fill />
    <TitleMenuHost />

    {#if fetchedTitles}
        <div class="relative" in:fade={{ duration: 300 }}>
            <Hero {showcasedTitle} onLogoError={refreshFeatured} />

            <SearchBar
                onLogoClick={refreshFeatured}
            />

            <div
                class="w-full z-10 h-fit flex flex-col gap-[clamp(56px,7vw,100px)] px-[clamp(24px,5.2vw,100px)] pb-[clamp(56px,7vw,100px)] pt-[clamp(28px,3vw,50px)]"
            >
                <ContinueWatching {continueWatchingMeta} />
                {#if popularMeta.length > 0}
                    <TitleRow title="Popular" titles={popularMeta} onSeeAll={seeAllPopular} />
                {/if}

                {#if spotlight}
                    {@const pick = spotlight}
                    <FeatureStrip
                        item={{
                            key: pick.imdb_id,
                            name: pick.name,
                            logo: pick.logo,
                            background: pick.background,
                            description: pick.description,
                            details: [pick.year ?? pick.releaseInfo, pick.runtime, pick.imdbRating ? `${pick.imdbRating} IMDb` : ""]
                                .filter(Boolean)
                                .join(" · "),
                            trailerId: isAndroidPlatform ? undefined : (getPrimaryTrailerId(pick) ?? undefined),
                        }}
                        onDetails={() => router.navigate("meta", { imdbId: pick.imdb_id, type: pick.type })}
                    />
                {/if}

                {#if traktRecommendationsConnected && traktRecommendations.length > 0}
                    <TitleRow title="Recommended for you" titles={traktRecommendations} />
                {/if}

                {#each addonSections as section (section.id)}
                    <TitleRow title={section.title} titles={section.titles} />
                {/each}

                {#if addonSectionsLoading}
                    {#each Array(2) as _}
                        <TitleRowSkeleton />
                    {/each}
                {/if}

                <BrowseSection />
            </div>
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
