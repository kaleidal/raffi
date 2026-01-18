<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { fade } from "svelte/transition";
    import { router } from "../../lib/stores/router";
    import Player from "../player/Player.svelte";

    import SeasonSelector from "../../components/meta/SeasonSelector.svelte";
    import EpisodeGrid from "../../components/meta/EpisodeGrid.svelte";
    import EpisodeContextMenu from "../../components/meta/context_menus/EpisodeContextMenu.svelte";
    import LoadingSpinner from "../../components/common/LoadingSpinner.svelte";

    import MetaBackground from "./components/MetaBackground.svelte";
    import MetaModals from "./components/MetaModals.svelte";

    import {
        loadedMeta,
        metaData,
        backgroundFailed,
        logoFailed,
        progressMap,
        lastWatched,
        episodes,
        seasons,
        seasonsArray,
        currentSeason,
        selectedEpisode,
        streams,
        loadingStreams,
        selectedStreamUrl,
        selectedFileIdx,
        selectedAddon,
        addons,
        streamsPopupVisible,
        playerVisible,
        showTorrentWarning,
        showEpisodeContextMenu,
        contextMenuPos,
        resetMetaState,
        contextEpisode,
    } from "./metaState";

    import * as DataLoader from "./dataLoader";
    import * as StreamLogic from "./streamLogic";
    import * as ProgressLogic from "./progressLogic";
    import * as NavigationLogic from "./navigationLogic";
    import ActionButtons from "../../components/meta/ActionButtons.svelte";
    import MetaInfo from "./components/MetaInfo.svelte";
    import UnsupportedTitleModal from "../../components/meta/modals/UnsupportedTitleModal.svelte";

    // Router params
    $: imdbID = $router.params.imdbId;
    $: titleType = $router.params.type || "movie";
    $: expectedName = $router.params.name || "";

    // Local state for player start
    let playerHasStarted = false;
    let startTime = 0;
    let streamsModalKey = "initial";
    let unsupportedReason: string | null = null;

    let useOverlayScrollHint = true;
    let viewportAspect = 16 / 9;
    let backgroundAspect: number | null = null;
    let lastBackgroundSrc = "";

    const updateViewportAspect = () => {
        if (typeof window === "undefined") return;
        viewportAspect = window.innerWidth / window.innerHeight;
        useOverlayScrollHint =
            backgroundAspect != null && backgroundAspect <= viewportAspect;
    };

    const loadBackgroundAspect = (src: string) => {
        if (!src || src === lastBackgroundSrc) return;
        lastBackgroundSrc = src;
        const img = new Image();
        img.onload = () => {
            if (!img.naturalWidth || !img.naturalHeight) return;
            backgroundAspect = img.naturalWidth / img.naturalHeight;
            updateViewportAspect();
        };
        img.onerror = () => {
            backgroundAspect = null;
            useOverlayScrollHint = false;
        };
        img.src = src;
    };

    onMount(async () => {
        resetMetaState();
        await DataLoader.loadAddons();
        updateViewportAspect();
        window.addEventListener("resize", updateViewportAspect);
    });

    onDestroy(() => {
        document.body.style.overflow = "";
        resetMetaState();
        window.removeEventListener("resize", updateViewportAspect);
    });

    $: if (imdbID) {
        DataLoader.loadMetaData(imdbID, titleType, expectedName).then(
            (type) => {
                if (type !== titleType) {
                    // Update router if type changed (fallback)
                }
            },
        );
    }

    $: if ($loadedMeta && $metaData) {
        if (!$metaData.meta?.background) {
            unsupportedReason = "This title is missing metadata.";
        } else if (
            $metaData.meta?.type === "series" &&
            (!$metaData.meta?.videos || $metaData.meta.videos.length === 0)
        ) {
            unsupportedReason = "No episodes found for this series.";
        } else {
            unsupportedReason = null;
        }

        const background = $metaData.meta?.background;
        if (background) {
            loadBackgroundAspect(background);
        } else {
            backgroundAspect = null;
            useOverlayScrollHint = false;
        }
    }

    $: {
        if ($playerVisible || $streamsPopupVisible || unsupportedReason) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
    }

    $: if ($selectedAddon && $selectedEpisode && $streamsPopupVisible) {
        StreamLogic.fetchStreams($selectedEpisode, false, false, imdbID);
    }

    $: if ($playerVisible && $selectedStreamUrl) {
        if ($metaData?.meta?.type === "movie") {
            const prog = ProgressLogic.getProgress($progressMap);
            if (prog && !prog.watched) {
                startTime = prog.time || 0;
            } else {
                startTime = 0;
            }
        } else if ($selectedEpisode) {
            const key = `${$selectedEpisode.season}:${$selectedEpisode.episode}`;
            const prog = ProgressLogic.getProgress($progressMap, key);
            if (prog && !prog.watched) {
                startTime = prog.time;
            } else {
                startTime = 0;
            }
        }
    }

    $: if ($progressMap) {
        streamsModalKey = (() => {
            if ($metaData?.meta?.type === "movie") {
                const entry: any = $progressMap;
                return [
                    "movie",
                    entry?.time ?? 0,
                    entry?.duration ?? 0,
                    entry?.watched ?? false,
                    entry?.updatedAt ?? 0,
                ].join(":");
            }
            const parts = Object.entries($progressMap || {}).map(
                ([key, value]: [string, any]) =>
                    [
                        key,
                        value?.time ?? 0,
                        value?.duration ?? 0,
                        value?.watched ?? false,
                        value?.updatedAt ?? 0,
                    ].join("-"),
            );
            return parts.join("|") || "series:empty";
        })();
    }
</script>

{#if $loadedMeta && $metaData && $metaData.meta}
    <div class="bg-[#090909] flex-1 relative" in:fade={{ duration: 300 }}>
        <div class="relative min-h-screen w-full overflow-hidden">
            <div class="absolute inset-0 opacity-60">
                <MetaBackground
                    background={$metaData.meta.background}
                    bind:backgroundFailed={$backgroundFailed}
                />
            </div>

            <button
                class="absolute top-12.5 left-12.5 z-50 bg-[#FFFFFF]/10 hover:bg-[#FFFFFF]/20 backdrop-blur-md p-4 rounded-full transition-colors duration-200 cursor-pointer"
                on:click={() => {
                    router.navigate("home");
                    StreamLogic.closePlayer();
                }}
                aria-label="Back to Home"
            >
                <svg
                    width="30"
                    height="30"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path
                        d="M15 19L8 12L15 5"
                        stroke="white"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    />
                </svg>
            </button>

            <div
                class="p-40 relative z-10 w-full flex gap-12.5 flex-row justify-between items-stretch"
                style="height: max(640px, calc(100vh - 20rem));"
            >
                <div
                    class="w-[40vw] flex gap-12.5 flex-col justify-between items-start"
                    style="height: max(640px, calc(100vh - 20rem));"
                >

            <style>
                .resume-button-shell {
                    border-radius: clamp(30px, 5vw, 50px);
                    overflow: hidden;
                }

                .resume-button {
                    min-height: 80px;
                    padding: clamp(14px, 2vw, 25px) clamp(40px, 6vw, 130px);
                    font-size: clamp(24px, 2.4vw, 48px);
                }

                .resume-button__label {
                    white-space: nowrap;
                }

                .resume-button__icon {
                    width: clamp(32px, 4vw, 70px);
                    height: clamp(32px, 4vw, 70px);
                }
            </style>
                    <div
                        class="flex flex-col gap-2.5 justify-start items-start w-full"
                    >
                        {#if $metaData.meta.logo && !$logoFailed}
                            <img
                                src={$metaData.meta.logo}
                                alt="Logo"
                                class="h-62.5 w-auto object-contain"
                                on:error={() => logoFailed.set(true)}
                            />
                        {:else}
                            <h1
                                class="text-[#E1E1E1] text-[64px] font-poppins font-bold leading-tight max-w-200"
                            >
                                {$metaData.meta.name}
                            </h1>
                        {/if}

                        <MetaInfo metaData={$metaData} />
                    </div>

                    {#if $metaData.meta.type === "series"}
                        {@const lastEpKey = `${$lastWatched.season}:${$lastWatched.episode}`}
                        {@const lastEpProgress = ProgressLogic.getProgress(
                            $progressMap,
                            lastEpKey,
                        )}
                        {@const isResumable =
                            lastEpProgress &&
                            !lastEpProgress.watched &&
                            lastEpProgress.time > 0}

                        <div class="relative rounded-[50px] resume-button-shell">
                            <button
                                class="bg-[#FFFFFF]/80 hover:bg-[#D3D3D3]/80 cursor-pointer backdrop-blur-2xl flex flex-row items-center justify-center gap-5 text-black font-poppins font-medium w-full transition-colors duration-200 relative z-10 resume-button"
                                on:click={() => {
                                    const nextEpIndex =
                                        $metaData.meta.videos.findIndex(
                                            (v) =>
                                                v.season ===
                                                    $lastWatched.season &&
                                                v.episode ===
                                                    $lastWatched.episode,
                                        );
                                    if (
                                        nextEpIndex !== -1 &&
                                        nextEpIndex <
                                            $metaData.meta.videos.length - 1
                                    ) {
                                        if (
                                            lastEpProgress &&
                                            lastEpProgress.watched
                                        ) {
                                            const nextEp =
                                                $metaData.meta.videos[
                                                    nextEpIndex + 1
                                                ];
                                            StreamLogic.episodeClicked(
                                                nextEp,
                                                imdbID,
                                            );
                                        } else {
                                            StreamLogic.episodeClicked(
                                                $metaData.meta.videos[
                                                    nextEpIndex
                                                ],
                                                imdbID,
                                            );
                                        }
                                    } else {
                                        StreamLogic.episodeClicked(
                                            $metaData.meta.videos[0],
                                            imdbID,
                                        );
                                    }
                                }}
                            >
                                <svg
                                    class="resume-button__icon"
                                    viewBox="0 0 92 92"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path
                                        d="M23 11.5L76.6667 46L23 80.5V11.5Z"
                                        stroke="black"
                                        stroke-width="10"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                    />
                                </svg>

                                <span class="resume-button__label">
                                    {#if isResumable}
                                        Resume S{$lastWatched.season}E{$lastWatched.episode}
                                    {:else if lastEpProgress && lastEpProgress.watched}
                                    {@const nextEpIndex =
                                        $metaData.meta.videos.findIndex(
                                            (v) =>
                                                v.season ===
                                                    $lastWatched.season &&
                                                v.episode ===
                                                    $lastWatched.episode,
                                        )}
                                        {#if nextEpIndex !== -1 && nextEpIndex < $metaData.meta.videos.length - 1}
                                            {@const nextEp =
                                                $metaData.meta.videos[
                                                    nextEpIndex + 1
                                                ]}
                                            Watch S{nextEp.season}E{nextEp.episode}
                                        {:else}
                                            Watch S1E1
                                        {/if}
                                    {:else}
                                        Watch S{$lastWatched.season}E{$lastWatched.episode ||
                                            1}
                                    {/if}
                                </span>
                            </button>
                            {#if isResumable}
                                <div
                                    class="absolute bottom-0 left-0 h-1.5 bg-[#676767] z-20 rounded-full overflow-hidden"
                                    style="width: {(lastEpProgress.time /
                                        lastEpProgress.duration) *
                                        100}%"
                                ></div>
                            {/if}
                        </div>
                    {:else}
                        {@const movieProgress =
                            ProgressLogic.getProgress($progressMap)}
                        {@const isMovieResumable =
                            movieProgress &&
                            !movieProgress.watched &&
                            movieProgress.time > 0}

                        <div class="relative rounded-[50px] resume-button-shell">
                            <button
                                class="bg-[#FFFFFF]/80 hover:bg-[#D3D3D3]/80 cursor-pointer backdrop-blur-2xl flex flex-row items-center justify-center gap-5 text-black font-poppins font-medium w-full transition-colors duration-200 relative z-10 resume-button"
                                on:click={() =>
                                    StreamLogic.episodeClicked(
                                        { season: 0, episode: 0 },
                                        imdbID,
                                    )}
                            >
                                <svg
                                    class="resume-button__icon"
                                    viewBox="0 0 92 92"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path
                                        d="M23 11.5L76.6667 46L23 80.5V11.5Z"
                                        stroke="black"
                                        stroke-width="10"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                    />
                                </svg>
                                <span class="resume-button__label">
                                    {#if isMovieResumable}
                                        Resume
                                    {:else}
                                        Watch Movie
                                    {/if}
                                </span>
                            </button>
                            {#if isMovieResumable}
                                <div
                                    class="absolute bottom-0 left-0 h-1.5 bg-[#676767] z-20 rounded-full overflow-hidden"
                                    style="width: {(movieProgress.time /
                                        movieProgress.duration) *
                                        100}%"
                                ></div>
                            {/if}
                        </div>
                    {/if}
                </div>

                <div
                    class="flex flex-col gap-5 justify-end items-end self-stretch"
                    style="height: max(640px, calc(100vh - 20rem));"
                >
                    {#if $metaData.meta.type === "series"}
                        {@const watchedCount = Object.values(
                            $progressMap,
                        ).filter((p: any) => p && p.watched).length}
                        {@const progressPercent =
                            $episodes > 0
                                ? (watchedCount / $episodes) * 100
                                : 0}
                        <div
                            class="px-15 py-10 w-full bg-[#FFFFFF]/10 backdrop-blur-lg rounded-[64px] flex flex-col gap-5"
                        >
                            <span
                                class="text-[#E1E1E1] text-[32px] font-poppins font-bold"
                                >{watchedCount}/{$episodes} episodes watched</span
                            >
                            <div
                                class="w-full h-2.5 bg-[#A3A3A3]/30 rounded-full overflow-hidden"
                            >
                                <div
                                    class="h-full bg-white rounded-full transition-all duration-300"
                                    style="width: {progressPercent}%"
                                ></div>
                            </div>
                        </div>
                    {/if}

                    <div
                        class="px-15 py-10 w-full bg-[#FFFFFF]/10 backdrop-blur-lg rounded-[64px] flex flex-col gap-5 justify-center"
                    >
                        {#if $metaData.meta.type === "series"}
                            <span
                                class="text-[#E1E1E1] text-[32px] font-poppins font-bold"
                                >{$episodes} episodes • {$seasons} seasons</span
                            >
                        {/if}

                        <div
                            class="flex flex-row gap-2.5 items-center justify-between"
                        >
                            <span
                                class="text-[#E8E8E8]/80 text-[24px] font-poppins font-medium"
                                >{$metaData.meta.year}</span
                            >

                            <div class="flex flex-row gap-2.5 items-center">
                                <span
                                    class="text-[#E8E8E8]/80 text-[24px] font-poppins font-medium"
                                    >{$metaData.meta.imdbRating}</span
                                >

                                <a
                                    href={`https://www.imdb.com/title/${$metaData.meta.imdb_id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="cursor-pointer hover:opacity-60 transition-opacity duration-200"
                                >
                                    <img
                                        src="imdb.png"
                                        alt="IMDB Logo"
                                        class="h-12.5 w-auto object-contain"
                                    />
                                </a>
                            </div>
                        </div>
                    </div>

                    <ActionButtons metaData={$metaData} />
                </div>
            </div>

            {#if $metaData.meta.type === "series"}
                <div
                    class="absolute bottom-0 left-0 w-full h-37.5 bg-linear-to-t from-[#090909] to-transparent"
                ></div>
                {#if useOverlayScrollHint}
                    <span
                        class="absolute left-1/2 -translate-x-1/2 text-[#E1E1E1]/60 text-[16px] font-poppins font-medium pointer-events-none"
                        style="bottom: clamp(20px, 5vh, 72px);"
                        >scroll down to view episodes</span
                    >
                {/if}
            {/if}
        </div>

        {#if $metaData.meta.type === "series"}
            {#if !useOverlayScrollHint}
                <div
                    class="w-full flex justify-center text-[#E1E1E1]/60 text-[16px] font-poppins font-medium"
                    style="margin-top: clamp(8px, 2vh, 16px); margin-bottom: clamp(12px, 3vh, 24px);"
                >
                    scroll down to view episodes
                </div>
            {/if}
            <div class="w-full p-40">
                <SeasonSelector
                    seasonsArray={$seasonsArray}
                    bind:currentSeason={$currentSeason}
                />
                <EpisodeGrid
                    metaData={$metaData}
                    currentSeason={$currentSeason}
                    progressMap={$progressMap}
                    on:episodeClick={(e) =>
                        StreamLogic.episodeClicked(e.detail, imdbID)}
                    on:episodeContextMenu={(e) =>
                        ProgressLogic.handleEpisodeContextMenu(
                            e.detail.event,
                            e.detail.episode,
                        )}
                />
            </div>
        {/if}
    </div>

    {#if unsupportedReason}
        <UnsupportedTitleModal
            title="Unsupported Title"
            message={unsupportedReason}
            on:back={() => router.navigate("home")}
            on:retry={() => window.location.reload()}
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
        progressSignature={streamsModalKey}
        onCloseStreamsPopup={StreamLogic.closeStreamsPopup}
        onStreamClick={(stream) =>
            StreamLogic.onStreamClick(stream, $progressMap)}
        onTorrentConfirm={() =>
            StreamLogic.handleTorrentWarningConfirm($progressMap)}
        onTorrentCancel={StreamLogic.handleTorrentWarningCancel}
    />

    {#if $showEpisodeContextMenu}
        <EpisodeContextMenu
            x={$contextMenuPos.x}
            y={$contextMenuPos.y}
            on:close={() => showEpisodeContextMenu.set(false)}
            on:watch={() => {
                if ($contextEpisode)
                    StreamLogic.episodeClicked($contextEpisode, imdbID);
            }}
            on:markWatched={() =>
                ProgressLogic.handleContextMarkWatched(imdbID)}
            on:markUnwatched={() =>
                ProgressLogic.handleContextMarkUnwatched(imdbID)}
            on:resetProgress={() =>
                ProgressLogic.handleContextResetProgress(imdbID)}
            on:markSeasonWatched={() =>
                ProgressLogic.handleContextMarkSeasonWatched(imdbID)}
            on:markSeasonUnwatched={() =>
                ProgressLogic.handleContextMarkSeasonUnwatched(imdbID)}
        />
    {/if}

    {#if $playerVisible && $selectedStreamUrl}
        <div class="w-full h-full z-100 fixed top-0 left-0">
            <Player
                videoSrc={$selectedStreamUrl}
                fileIdx={$selectedFileIdx}
                metaData={$metaData}
                {startTime}
                onClose={StreamLogic.closePlayer}
                onNextEpisode={() =>
                    NavigationLogic.handleNextEpisode(imdbID, $progressMap)}
                onProgress={(t, d) =>
                    ProgressLogic.handleProgress(
                        t,
                        d,
                        imdbID,
                        playerHasStarted,
                    )}
                season={$selectedEpisode?.season}
                episode={$selectedEpisode?.episode}
                bind:hasStarted={playerHasStarted}
            />
        </div>
    {/if}
{:else}
    {#if unsupportedReason}
        <UnsupportedTitleModal
            title="Unsupported Title"
            message={unsupportedReason}
            on:back={() => router.navigate("home")}
            on:retry={() => window.location.reload()}
        />
    {:else}
        <div
            class="w-full h-full flex items-center justify-center"
            out:fade={{ duration: 200 }}
        >
            <LoadingSpinner size="60px" />
        </div>
    {/if}
{/if}