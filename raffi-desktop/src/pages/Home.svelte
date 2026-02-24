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
        getTraktRecommendations,
        getTraktStatus,
        getLibrary,
        updateLibraryPoster,
        type Addon,
        type TraktRecommendation,
    } from "../lib/db/db";
    import {
        getStoredHomeHeroSource,
        HOME_HERO_SOURCE_CINEMETA,
        HOME_HERO_SOURCE_TRAKT_RECOMMENDATIONS,
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
    let traktRecommendations: PopularTitleMeta[] = [];
    let traktRecommendationsConnected = false;
    let addonSectionsLoading = false;
    const HOME_REFRESH_EVENT = "raffi:home-refresh";

    function extractYouTubeId(value: unknown): string | null {
        const raw = String(value || "").trim();
        if (!raw) return null;
        if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;

        try {
            const url = new URL(raw);
            if (url.hostname.includes("youtube.com")) {
                const id = url.searchParams.get("v");
                if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) return id;
            }
            if (url.hostname.includes("youtu.be")) {
                const id = url.pathname.replace(/^\//, "");
                if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) return id;
            }
        } catch {
            // ignore
        }

        return null;
    }

    function getTrailerStreamsFromMeta(meta: ShowResponse["meta"]) {
        const richMeta = meta as any;
        if (Array.isArray(richMeta?.trailerStreams) && richMeta.trailerStreams.length > 0) {
            return richMeta.trailerStreams
                .map((entry: any) => ({
                    title: String(entry?.title || meta.name || "Trailer"),
                    ytId: String(entry?.ytId || "").trim(),
                }))
                .filter((entry: any) => /^[A-Za-z0-9_-]{11}$/.test(entry.ytId));
        }

        const trailers = Array.isArray(meta.trailers) ? meta.trailers : [];
        return trailers
            .map((trailer) => {
                const ytId = extractYouTubeId((trailer as any)?.source);
                if (!ytId) return null;
                return {
                    title: String(meta.name || "Trailer"),
                    ytId,
                };
            })
            .filter((entry): entry is { title: string; ytId: string } => entry !== null);
    }

    function mapMetaToPopular(meta: ShowResponse["meta"]): PopularTitleMeta {
        const normalizedType = meta.type === "series" ? "series" : "movie";
        const richMeta = meta as any;
        return {
            imdb_id: meta.imdb_id,
            id: meta.id || meta.imdb_id,
            name: meta.name || "Unknown",
            type: normalizedType,
            popularities: { ...(meta.popularities ?? {}) },
            description: meta.description || "",
            poster: meta.poster || undefined,
            genre: Array.isArray(meta.genre) ? meta.genre : undefined,
            genres: Array.isArray(meta.genres) ? meta.genres : undefined,
            imdbRating: meta.imdbRating || undefined,
            released: meta.released || undefined,
            slug: meta.slug || "",
            year: meta.year || undefined,
            director: Array.isArray(meta.director)
                ? meta.director
                : meta.director
                    ? [meta.director]
                    : null,
            writer: Array.isArray(meta.writer) ? meta.writer : null,
            trailers: Array.isArray(meta.trailers) ? meta.trailers : undefined,
            status: meta.status || undefined,
            background: meta.background || undefined,
            logo: meta.logo || undefined,
            popularity: meta.popularity,
            releaseInfo: meta.releaseInfo || undefined,
            trailerStreams: getTrailerStreamsFromMeta(meta),
            links: Array.isArray(richMeta?.links) ? richMeta.links : undefined,
            behaviorHints: richMeta?.behaviorHints,
            awards: meta.awards || undefined,
            runtime: meta.runtime || undefined,
            dvdRelease: meta.dvdRelease || undefined,
            cast: Array.isArray(meta.cast) ? meta.cast : undefined,
        };
    }

    async function loadTraktRecommendations() {
        try {
            const status = await getTraktStatus();
            traktRecommendationsConnected = Boolean(status.connected && status.configured);
            if (!traktRecommendationsConnected) {
                traktRecommendations = [];
                return;
            }

            const traktItems: TraktRecommendation[] = await getTraktRecommendations(24);
            if (!Array.isArray(traktItems) || traktItems.length === 0) {
                traktRecommendations = [];
                return;
            }

            const enriched = await Promise.all(
                traktItems.map(async (item) => {
                    try {
                        const meta = await getCachedMetaData(item.imdbId, item.type);
                        if (!meta?.meta) return null;
                        return mapMetaToPopular(meta.meta);
                    } catch {
                        return null;
                    }
                }),
            );

            const deduped = new Map<string, PopularTitleMeta>();
            for (const item of enriched) {
                if (item && !deduped.has(item.imdb_id)) {
                    deduped.set(item.imdb_id, item);
                }
            }

            traktRecommendations = Array.from(deduped.values()).slice(0, 20);
        } catch (error) {
            console.error("Failed to load Trakt recommendations", error);
            traktRecommendations = [];
            traktRecommendationsConnected = false;
        }
    }

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
        const selectedSourceId = getStoredHomeHeroSource();

        if (
            selectedSourceId === HOME_HERO_SOURCE_TRAKT_RECOMMENDATIONS &&
            heroPoolTitles.length > 0
        ) {
            const traktHeroCandidates = heroPoolTitles.filter(
                (title) =>
                    Array.isArray(title.trailerStreams) &&
                    title.trailerStreams.length > 0,
            );
            const traktLogoCandidates = traktHeroCandidates.filter((title) => Boolean(title.logo));
            const traktSelected = chooseRandom(
                traktLogoCandidates.length > 0
                    ? traktLogoCandidates
                    : traktHeroCandidates.length > 0
                        ? traktHeroCandidates
                        : heroPoolTitles,
            );
            if (traktSelected) {
                showcasedTitle = traktSelected;
                return;
            }
        }

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

        const looseCandidates = [...heroPoolTitles, ...absolutePopularTitles].filter(
            (title) => Boolean(title.logo)
        );
        const looseFallback = chooseRandom(looseCandidates);
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

            if (selectedSourceId === HOME_HERO_SOURCE_TRAKT_RECOMMENDATIONS) {
                if (traktRecommendations.length === 0) {
                    await loadTraktRecommendations();
                }
                if (traktRecommendations.length > 0) {
                    heroPoolTitles = traktRecommendations;
                    setFeaturedFromPool();
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

            await loadTraktRecommendations();
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
            await loadTraktRecommendations();
            await Promise.all([
                loadContinueWatching(),
                refreshAddonSections(installedAddons),
            ]);
            await refreshHeroSourcePool(installedAddons);
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
                <div class="w-full h-[6px] -mt-[3px] bg-[#090909] relative z-20"></div>
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

                {#if traktRecommendationsConnected && traktRecommendations.length > 0}
                    <GenreSection
                        genre="Recommended for You (Trakt)"
                        titles={traktRecommendations}
                    />
                {/if}

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
