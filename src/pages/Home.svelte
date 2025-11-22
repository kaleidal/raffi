<script lang="ts">
    import { onMount } from "svelte";
    import { getMetaData, getPopularTitles } from "../lib/library/library";
    import type { ShowResponse } from "../lib/library/types/meta_types";
    import type { PopularTitleMeta } from "../lib/library/types/popular_types";
    import { getLibrary } from "../lib/db/db";

    import Hero from "../components/home/Hero.svelte";
    import SearchBar from "../components/home/SearchBar.svelte";
    import ContinueWatching from "../components/home/ContinueWatching.svelte";
    import AddonsModal from "../components/AddonsModal.svelte";

    let showcasedTitle: PopularTitleMeta;
    let fetchedTitles = false;
    let continueWatchingMeta: (ShowResponse & { libraryItem: any })[] = [];
    let showAddonsModal = false;

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
                randomTitle.trailerStreams[0]
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

        console.log(showcasedTitle);

        try {
            const library = await getLibrary();
            library.sort(
                (a, b) =>
                    new Date(b.last_watched).getTime() -
                    new Date(a.last_watched).getTime(),
            );

            const recent = library.slice(0, 10);
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

        fetchedTitles = true;
    });

    function handleOpenAddons() {
        showAddonsModal = true;
    }
</script>

{#if fetchedTitles}
    <div class="bg-[#090909] h-fit min-h-screen flex flex-col pb-[100px]">
        {#if showcasedTitle}
            <Hero {showcasedTitle} />
        {/if}

        <SearchBar on:openAddons={handleOpenAddons} />

        <div class="w-full z-10 h-fit p-[100px] pt-[50px]">
            <ContinueWatching {continueWatchingMeta} />
        </div>
    </div>

    <AddonsModal bind:showAddonsModal />
{/if}
