<script lang="ts">
    import { onDestroy, onMount, untrack } from "svelte";
    import { fade } from "svelte/transition";
    import { ChevronLeft } from "@lucide/svelte";
    import { router } from "../../lib/stores/router";

    import SeasonSelector from "../../components/meta/SeasonSelector.svelte";
    import EpisodeGrid from "../../components/meta/EpisodeGrid.svelte";
    import EpisodeContextMenu from "../../components/meta/context_menus/EpisodeContextMenu.svelte";
    import PageLoading from "../../components/common/loading/PageLoading.svelte";
    import AmbientBackdrop from "../../components/common/AmbientBackdrop.svelte";
    import UnsupportedTitleModal from "../../components/meta/modals/UnsupportedTitleModal.svelte";
    import { ADDONS_CHANGED_EVENT } from "../../components/settings/addons/addonsShared";

    import MetaBackground from "./components/MetaBackground.svelte";
    import MetaHero from "./components/MetaHero.svelte";
    import MetaModals from "./components/MetaModals.svelte";

    import {
        loadedMeta,
        metaData,
        metaLoadError,
        backgroundFailed,
        logoFailed,
        progressMap,
        lastWatched,
        seasons,
        seasonsArray,
        currentSeason,
        selectedEpisode,
        streams,
        loadingStreams,
        selectedAddon,
        addons,
        streamsPopupVisible,
        startingPlayback,
        streamsToReopen,
        showTorrentWarning,
        showEpisodeContextMenu,
        contextMenuPos,
        resetMetaState,
        contextEpisode,
    } from "./metaState";

    import * as DataLoader from "./dataLoader";
    import * as StreamLogic from "./streamLogic";
    import * as ProgressLogic from "./progressLogic";
    import { hydrateStreamFailures } from "./streamFailures";

    const imdbID = $derived($router.params.imdbId);
    const titleType = $derived($router.params.type || "movie");
    const expectedName = $derived($router.params.name || "");

    const handleAddonsChanged = () => void DataLoader.loadAddons();

    onMount(async () => {
        resetMetaState();
        hydrateStreamFailures();
        await DataLoader.loadAddons();
        window.addEventListener(ADDONS_CHANGED_EVENT, handleAddonsChanged);
    });

    onDestroy(() => {
        streamsToReopen.set(null);
        StreamLogic.closeStreamsPopup();
        DataLoader.cancelMetaDataLoad();
        window.removeEventListener(ADDONS_CHANGED_EVENT, handleAddonsChanged);
    });

    $effect(() => {
        const [id, type, name] = [imdbID, titleType, expectedName];
        if (id) untrack(() => void DataLoader.loadMetaData(id, type, name));
    });

    const unsupportedReason = $derived.by(() => {
        if ($metaLoadError) return $metaLoadError;
        if (!$loadedMeta || !$metaData) return null;
        if (!$metaData.meta?.background) return "This title is missing metadata.";
        if ($metaData.meta.type === "series" && !$metaData.meta.videos?.length) return "No episodes found for this series.";
        return null;
    });

    $effect(() => {
        const episode = $selectedEpisode;
        if ($selectedAddon && episode && $streamsPopupVisible) {
            untrack(() => StreamLogic.refreshStreamsForAddon(episode, imdbID));
        }
    });

    $effect(() => {
        const reopen = $streamsToReopen;
        if (reopen && $loadedMeta && reopen.imdbId === $metaData?.meta?.imdb_id && $selectedAddon) {
            untrack(() => {
                streamsToReopen.set(null);
                void StreamLogic.episodeClicked(reopen.episode, imdbID);
            });
        }
    });

    const progressSignature = $derived(JSON.stringify($progressMap));

    const playEpisode = (episode: { season: number; episode: number }) => StreamLogic.playBestStream(episode, imdbID);
    const chooseSource = (episode: { season: number; episode: number }) => StreamLogic.episodeClicked(episode, imdbID);
</script>

{#if $loadedMeta && $metaData && $metaData.meta}
    <div class="relative flex-1 bg-canvas" in:fade={{ duration: 300 }}>
        <AmbientBackdrop src={$metaData.meta.background} fill />
        <div class="meta-shell relative w-full bg-canvas scheme-dark">
            <div class="meta-backdrop absolute inset-0 opacity-60">
                <MetaBackground background={$metaData.meta.background} bind:backgroundFailed={$backgroundFailed} />
            </div>

            <button
                class="absolute top-[clamp(24px,3vw,50px)] left-[clamp(24px,3vw,50px)] z-50 cursor-pointer rounded-full bg-ink/10 p-[clamp(12px,1vw,16px)] backdrop-blur-md transition-colors duration-200 hover:bg-ink/20"
                onclick={() => router.navigate("home")}
                aria-label="Back to Home"
            >
                <ChevronLeft size={30} strokeWidth={2} />
            </button>

            <div
                class="meta-hero relative z-10 flex w-full flex-col items-stretch justify-between gap-[clamp(28px,3vw,50px)] px-[clamp(32px,6vw,72px)] py-[clamp(72px,10vh,120px)] xl:min-h-[720px] xl:flex-row xl:px-[9.2vw] xl:pt-[14.8vw] xl:pb-[9.2vw]"
                class:peek-episodes={$metaData.meta.type === "series"}
            >
                <div
                    class="flex min-h-[clamp(460px,58vh,620px)] w-full flex-col items-start justify-between gap-[clamp(28px,2.6vw,44px)] xl:min-h-0 xl:w-[40vw]"
                >
                    <MetaHero
                        metaData={$metaData}
                        progressMap={$progressMap}
                        lastWatched={$lastWatched}
                        seasons={$seasons}
                        logoFailed={$logoFailed}
                        starting={$startingPlayback}
                        onLogoError={() => logoFailed.set(true)}
                        onPlay={playEpisode}
                        onChooseSource={chooseSource}
                    />
                </div>
            </div>
        </div>

        {#if $metaData.meta.type === "series"}
            <div class="relative w-full px-[clamp(32px,8.3vw,160px)] pt-2 pb-[clamp(32px,8.3vw,160px)]">
                <SeasonSelector seasonsArray={$seasonsArray} bind:currentSeason={$currentSeason} />
                <EpisodeGrid
                    metaData={$metaData}
                    currentSeason={$currentSeason}
                    progressMap={$progressMap}
                    onEpisodeClick={playEpisode}
                    onEpisodeContextMenu={(detail) => ProgressLogic.handleEpisodeContextMenu(detail.event, detail.episode)}
                />
            </div>
        {/if}
    </div>

    {#if unsupportedReason}
        <UnsupportedTitleModal
            title="Unsupported Title"
            message={unsupportedReason}
            onBack={() => router.navigate("home")}
            onRetry={() => window.location.reload()}
        />
    {/if}

    <MetaModals
        streamsPopupVisible={$streamsPopupVisible}
        showTorrentWarning={$showTorrentWarning}
        addons={$addons}
        bind:selectedAddon={$selectedAddon}
        loadingStreams={$loadingStreams}
        streams={$streams}
        metaData={$metaData}
        selectedEpisode={$selectedEpisode}
        progressMap={$progressMap}
        {progressSignature}
        onCloseStreamsPopup={StreamLogic.closeStreamsPopup}
        onStreamClick={(stream) => StreamLogic.onStreamClick(stream, $progressMap)}
        onTorrentConfirm={() => StreamLogic.handleTorrentWarningConfirm($progressMap)}
        onTorrentCancel={StreamLogic.handleTorrentWarningCancel}
    />

    {#if $showEpisodeContextMenu}
        <EpisodeContextMenu
            x={$contextMenuPos.x}
            y={$contextMenuPos.y}
            onClose={() => showEpisodeContextMenu.set(false)}
            onWatch={() => $contextEpisode && playEpisode($contextEpisode)}
            onChooseSource={() => $contextEpisode && chooseSource($contextEpisode)}
            onMarkWatched={() => ProgressLogic.handleContextMarkWatched(imdbID)}
            onMarkUnwatched={() => ProgressLogic.handleContextMarkUnwatched(imdbID)}
            onResetProgress={() => ProgressLogic.handleContextResetProgress(imdbID)}
            onMarkSeasonWatched={() => ProgressLogic.handleContextMarkSeasonWatched(imdbID)}
            onMarkSeasonUnwatched={() => ProgressLogic.handleContextMarkSeasonUnwatched(imdbID)}
        />
    {/if}
{:else if unsupportedReason}
    <UnsupportedTitleModal
        title="Unsupported Title"
        message={unsupportedReason}
        onBack={() => router.navigate("home")}
        onRetry={() => window.location.reload()}
    />
{:else}
    <PageLoading />
{/if}

<style>
    :global(:root[data-theme="light"]) .meta-backdrop {
        opacity: 0.85;
    }

    .meta-shell {
        --meta-fade: clamp(120px, 16vh, 180px);
        mask-image: linear-gradient(
            to top,
            transparent,
            rgb(0 0 0 / 0.1) calc(var(--meta-fade) * 0.15),
            rgb(0 0 0 / 0.35) calc(var(--meta-fade) * 0.38),
            rgb(0 0 0 / 0.65) calc(var(--meta-fade) * 0.62),
            rgb(0 0 0 / 0.9) calc(var(--meta-fade) * 0.85),
            black var(--meta-fade)
        );
    }

    :global(:root[data-theme="light"]) .meta-shell {
        --meta-fade: 30%;
    }

    .meta-hero {
        min-height: calc(100dvh - var(--episode-peek, 0px));
    }

    .meta-hero.peek-episodes {
        --episode-peek: clamp(84px, 11vh, 120px);
    }
</style>
