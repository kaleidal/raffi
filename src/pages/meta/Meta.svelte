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

    // Router params
    $: imdbID = $router.params.imdbId;
    $: titleType = $router.params.type || "movie";
    $: expectedName = $router.params.name || "";

    // Local state for player start
    let playerHasStarted = false;
    let startTime = 0;

    onMount(async () => {
        resetMetaState();
        await DataLoader.loadAddons();
    });

    onDestroy(() => {
        document.body.style.overflow = "";
        resetMetaState();
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

    $: {
        if ($playerVisible || $streamsPopupVisible) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
    }

    $: if ($selectedAddon && $selectedEpisode && $streamsPopupVisible) {
        StreamLogic.fetchStreams($selectedEpisode, false, false, imdbID);
    }

    $: if ($playerVisible && $selectedStreamUrl) {
        if ($metaData?.meta.type === "movie") {
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
</script>

{#if $loadedMeta && $metaData}
    <div class="bg-[#090909] flex-1" in:fade={{ duration: 300 }}>
        <div class="w-[100vw] h-[100vh]">
            <div class="h-[100vh] opacity-60 w-full">
                <MetaBackground
                    background={$metaData.meta.background}
                    bind:backgroundFailed={$backgroundFailed}
                />
            </div>

            <button
                class="absolute top-[50px] left-[50px] z-50 bg-[#FFFFFF]/10 hover:bg-[#FFFFFF]/20 backdrop-blur-md p-4 rounded-full transition-colors duration-200 cursor-pointer"
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
                class="p-40 absolute top-0 left-0 h-screen w-screen flex gap-[50px] flex-row justify-between items-start"
            >
                <div
                    class="w-[40vw] h-full flex gap-[50px] flex-col justify-between items-start"
                >
                    <div
                        class="flex flex-col gap-[10px] justify-start items-start w-full"
                    >
                        {#if $metaData.meta.logo && !$logoFailed}
                            <img
                                src={$metaData.meta.logo}
                                alt="Logo"
                                class="h-[250px] w-auto object-contain"
                                on:error={() => logoFailed.set(true)}
                            />
                        {:else}
                            <h1
                                class="text-[#E1E1E1] text-[64px] font-poppins font-bold leading-tight max-w-[800px]"
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

                        <div class="relative overflow-hidden rounded-[50px]">
                            <button
                                class="bg-[#FFFFFF]/80 hover:bg-[#D3D3D3]/80 cursor-pointer backdrop-blur-2xl flex flex-row items-center justify-center gap-[20px] text-black text-[48px] font-poppins font-medium px-[130px] py-[25px] w-full transition-colors duration-200 relative z-10"
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
                                    width="70"
                                    height="70"
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
                            </button>
                            {#if isResumable}
                                <div
                                    class="absolute bottom-0 left-0 h-[6px] bg-[#676767] z-20"
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

                        <div class="relative overflow-hidden rounded-[50px]">
                            <button
                                class="bg-[#FFFFFF]/80 hover:bg-[#D3D3D3]/80 cursor-pointer backdrop-blur-2xl flex flex-row items-center justify-center gap-[20px] text-black text-[48px] font-poppins font-medium px-[130px] py-[25px] w-full transition-colors duration-200 relative z-10"
                                on:click={() =>
                                    StreamLogic.episodeClicked(
                                        { season: 0, episode: 0 },
                                        imdbID,
                                    )}
                            >
                                <svg
                                    width="70"
                                    height="70"
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
                                {#if isMovieResumable}
                                    Resume
                                {:else}
                                    Watch Movie
                                {/if}
                            </button>
                            {#if isMovieResumable}
                                <div
                                    class="absolute bottom-0 left-0 h-[6px] bg-[#676767] z-20"
                                    style="width: {(movieProgress.time /
                                        movieProgress.duration) *
                                        100}%"
                                ></div>
                            {/if}
                        </div>
                    {/if}
                </div>

                <div
                    class="flex flex-col gap-[20px] h-full justify-end items-end"
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
                            class="px-[60px] py-[40px] w-full bg-[#FFFFFF]/10 backdrop-blur-[16px] rounded-[64px] flex flex-col gap-[20px]"
                        >
                            <span
                                class="text-[#E1E1E1] text-[32px] font-poppins font-bold"
                                >{watchedCount}/{$episodes} episodes watched</span
                            >
                            <div
                                class="w-full h-[10px] bg-[#A3A3A3]/30 rounded-full overflow-hidden"
                            >
                                <div
                                    class="h-full bg-white rounded-full transition-all duration-300"
                                    style="width: {progressPercent}%"
                                ></div>
                            </div>
                        </div>
                    {/if}

                    <div
                        class="px-[60px] py-[40px] w-full bg-[#FFFFFF]/10 backdrop-blur-[16px] rounded-[64px] flex flex-col gap-[20px] justify-center"
                    >
                        {#if $metaData.meta.type === "series"}
                            <span
                                class="text-[#E1E1E1] text-[32px] font-poppins font-bold"
                                >{$episodes} episodes • {$seasons} seasons</span
                            >
                        {/if}

                        <div
                            class="flex flex-row gap-[10px] items-center justify-between"
                        >
                            <span
                                class="text-[#E8E8E8]/80 text-[24px] font-poppins font-medium"
                                >{$metaData.meta.year}</span
                            >

                            <div class="flex flex-row gap-[10px] items-center">
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
                                        class="h-[50px] w-auto object-contain"
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
                    class="absolute bottom-0 left-0 w-full h-[150px] bg-gradient-to-t from-[#090909] to-transparent"
                ></div>

                <span
                    class="absolute bottom-10 left-1/2 transform -translate-x-1/2 text-[#E1E1E1]/60 text-[16px] font-poppins font-medium"
                    >scroll down to view episodes</span
                >
            {/if}
        </div>

        {#if $metaData.meta.type === "series"}
            <div class="w-screen p-40">
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

    <MetaModals
        streamsPopupVisible={$streamsPopupVisible}
        showTorrentWarning={$showTorrentWarning}
        addons={$addons}
        bind:selectedAddon={$selectedAddon}
        loadingStreams={$loadingStreams}
        streams={$streams}
        metaData={$metaData}
        onCloseStreamsPopup={StreamLogic.closeStreamsPopup}
        onStreamClick={(stream) =>
            StreamLogic.onStreamClick(stream, $progressMap)}
        onTorrentConfirm={() =>
            StreamLogic.handleTorrentWarningConfirm($progressMap)}
        onTorrentCancel={StreamLogic.handleTorrentWarningCancel}
    />

    {#if $playerVisible && $selectedStreamUrl}
        <div class="w-screen h-screen z-100 fixed top-0 left-0">
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
    <div
        class="w-full h-screen flex items-center justify-center"
        out:fade={{ duration: 200 }}
    >
        <LoadingSpinner size="60px" />
    </div>
{/if}
