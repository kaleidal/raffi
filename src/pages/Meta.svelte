<script lang="ts">
    import { getMetaData } from "../lib/library/library";
    import type { ShowResponse } from "../lib/library/types/meta_types";
    import { onDestroy, onMount } from "svelte";
    import Player from "./Player.svelte";
    import { slide, fade } from "svelte/transition";
    import { router } from "../lib/stores/router";
    import {
        getAddons,
        getLibraryItem,
        updateLibraryProgress,
    } from "../lib/db/db";

    import SeasonSelector from "../components/meta/SeasonSelector.svelte";
    import EpisodeGrid from "../components/meta/EpisodeGrid.svelte";
    import StreamsPopup from "../components/meta/StreamsPopup.svelte";
    import ActionButtons from "../components/meta/ActionButtons.svelte";

    let addons: string[] = [];

    onMount(async () => {
        try {
            const dbAddons = await getAddons();
            if (dbAddons.length > 0) {
                addons = dbAddons.map((a) => a.transport_url);
                selectedAddon = addons[0];
            }
        } catch (e) {
            console.error("Failed to load addons", e);
        }
    });

    // Get params from router store
    $: imdbID = $router.params.imdbId;
    $: titleType = $router.params.type || "movie";

    let lastWatched = { season: 1, episode: 0 };

    let loadedMeta: boolean = false;
    let metaData: ShowResponse;

    let episodes: number = 0;
    let seasons: number = 0;

    let seasonsArray: number[] = [];
    let currentSeason: number = 1;

    let streamsPopupVisible = false;
    let playerVisible = false;
    let streams: any[] = [];
    let selectedStreamUrl: string | null = null;
    let selectedAddon: string = addons[0];
    let loadingStreams = false;
    let selectedEpisode: any = null;
    let progressMap: any = {};
    let libraryItem: any = null;

    let selectedStream: any = null;

    const fetchStreams = async (episode: any, silent: boolean = false) => {
        loadingStreams = true;
        streams = [];
        if (!silent) {
            streamsPopupVisible = true;
        }
        selectedEpisode = episode;

        try {
            const type = metaData.meta.type;
            let streamId = imdbID;
            if (type === "series") {
                streamId += `:${episode.season}:${episode.episode}`;
            }

            const response = await fetch(
                selectedAddon + "/stream/" + type + "/" + streamId + ".json",
            );
            const data = await response.json();
            if (data.streams) {
                streams = data.streams;
                return streams;
            }
        } catch (e) {
            console.error("Failed to fetch streams", e);
        } finally {
            loadingStreams = false;
        }
        return [];
    };

    const episodeClicked = async (episode: any) => {
        await fetchStreams(episode);
    };

    let startTime = 0;

    const onStreamClick = (stream: any) => {
        // stream.url or stream.infoHash
        // For now assuming stream.url as torrenting hasn't been implemented yet.
        if (stream.url) {
            selectedStream = stream;
            selectedStreamUrl = stream.url;

            if (selectedEpisode) {
                if (metaData.meta.type === "movie") {
                    if (progressMap && !progressMap.watched) {
                        startTime = progressMap.time || 0;
                    } else {
                        startTime = 0;
                    }
                } else {
                    const key = `${selectedEpisode.season}:${selectedEpisode.episode}`;
                    const prog = progressMap[key];
                    if (prog && !prog.watched) {
                        startTime = prog.time;
                    } else {
                        startTime = 0;
                    }
                }
                console.log("Setting startTime:", startTime);
            }

            playerVisible = true;
            streamsPopupVisible = false;
        } else {
            console.warn("Stream has no URL", stream);
        }
    };

    const closePlayer = () => {
        playerVisible = false;
        selectedStreamUrl = null;
    };

    const closeStreamsPopup = () => {
        streamsPopupVisible = false;
        streams = [];
    };

    const handleNextEpisode = async () => {
        if (!selectedEpisode || !metaData || !metaData.meta.videos) return;

        const currentIndex = metaData.meta.videos.findIndex(
            (v) =>
                v.season === selectedEpisode.season &&
                v.episode === selectedEpisode.episode,
        );

        if (
            currentIndex !== -1 &&
            currentIndex < metaData.meta.videos.length - 1
        ) {
            const nextEp = metaData.meta.videos[currentIndex + 1];

            if (nextEp.season !== currentSeason) {
                currentSeason = nextEp.season;
            }

            const nextStreams = await fetchStreams(nextEp, true);

            let match = null;
            if (selectedStream && nextStreams.length > 0) {
                match = nextStreams.find(
                    (s) =>
                        s.name === selectedStream.name &&
                        s.title.includes(selectedStream.title.split("\n")[0]),
                );

                if (!match) {
                    match = nextStreams.find(
                        (s) => s.name === selectedStream.name,
                    );
                }
            }

            if (match) {
                console.log("Auto-selecting matching stream:", match);
                onStreamClick(match);
            } else {
                streamsPopupVisible = true;
                playerVisible = false;
                selectedStreamUrl = null;
            }
        } else {
            console.log("No next episode found");
            playerVisible = false;
        }
    };

    let lastUpdate = 0;
    const handleProgress = async (time: number, duration: number) => {
        if (!selectedEpisode || !imdbID) return;

        const isWatched = time > duration * 0.9;
        const type = metaData.meta.type;

        if (type === "movie") {
            progressMap = {
                time,
                duration,
                watched: isWatched,
                updatedAt: Date.now(),
            };
        } else {
            const key = `${selectedEpisode.season}:${selectedEpisode.episode}`;
            progressMap[key] = {
                time,
                duration,
                watched: isWatched,
                updatedAt: Date.now(),
            };
            progressMap = progressMap; // Trigger reactivity
        }

        const now = Date.now();
        if (now - lastUpdate > 5000 || isWatched) {
            lastUpdate = now;
            await updateLibraryProgress(imdbID, progressMap, type, false);
        }
    };

    $: if (selectedAddon && selectedEpisode) {
        if (streamsPopupVisible) {
            fetchStreams(selectedEpisode);
        }
    }

    const loadData = async () => {
        if (!imdbID) return;
        loadedMeta = false;
        metaData = await getMetaData(imdbID, titleType);
        loadedMeta = true;

        episodes = (metaData.meta.videos || []).filter(
            (video) => video.season > 0,
        ).length;

        seasons = Math.max(
            0,
            ...(metaData.meta.videos || []).map((video) => video.season),
        );

        seasonsArray = [];
        for (let i = 1; i <= seasons; i++) {
            seasonsArray.push(i);
        }

        try {
            const item = await getLibraryItem(imdbID);
            if (item) {
                libraryItem = item;
                progressMap = item.progress || {};

                // lastWatched is now reactive, no need to calculate here
            }
        } catch (e) {
            console.error("Failed to load library item", e);
        }
    };

    $: {
        let latest = 0;
        let latestKey = "";
        for (const [key, val] of Object.entries(progressMap)) {
            const v = val as any;
            if (v.updatedAt > latest) {
                latest = v.updatedAt;
                latestKey = key;
            }
        }

        if (latestKey) {
            const [s, e] = latestKey.split(":").map(Number);
            lastWatched = { season: s, episode: e };
        }
    }

    $: if (imdbID) {
        loadData();
    }
    $: {
        if (playerVisible || streamsPopupVisible) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
    }

    onDestroy(() => {
        document.body.style.overflow = "";
    });
</script>

{#if loadedMeta}
    <div class="bg-[#090909] flex-1">
        <div class="w-screen h-screen">
            <img
                src={metaData.meta.background ?? ""}
                alt="Cover"
                class="h-screen opacity-60 w-full object-cover"
            />

            <button
                class="absolute top-[50px] left-[50px] z-50 bg-[#FFFFFF]/10 hover:bg-[#FFFFFF]/20 backdrop-blur-md p-4 rounded-full transition-colors duration-200 cursor-pointer"
                on:click={() => {
                    router.navigate("home");
                    closePlayer();
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
                        class="flex flex-col gap-[20px] justify-start items-start"
                    >
                        <img
                            src={metaData.meta.logo ?? ""}
                            alt="Logo"
                            class="h-[250px] w-auto object-contain"
                        />
                        <span class="text-[#E1E1E1] text-[20px] font-[500]"
                            >{metaData.meta.description ?? ""}</span
                        >
                    </div>

                    {#if metaData.meta.type === "series"}
                        {@const lastEpKey = `${lastWatched.season}:${lastWatched.episode}`}
                        {@const lastEpProgress = progressMap[lastEpKey]}
                        {@const isResumable =
                            lastEpProgress &&
                            !lastEpProgress.watched &&
                            lastEpProgress.time > 0}

                        <div class="relative overflow-hidden rounded-[50px]">
                            <button
                                class="bg-[#FFFFFF]/80 hover:bg-[#D3D3D3]/80 cursor-pointer backdrop-blur-2xl flex flex-row items-center justify-center gap-[20px] text-black text-[48px] font-poppins font-medium px-[130px] py-[25px] w-full transition-colors duration-200 relative z-10"
                                on:click={() => {
                                    const nextEpIndex =
                                        metaData.meta.videos.findIndex(
                                            (v) =>
                                                v.season ===
                                                    lastWatched.season &&
                                                v.episode ===
                                                    lastWatched.episode,
                                        );
                                    if (
                                        nextEpIndex !== -1 &&
                                        nextEpIndex <
                                            metaData.meta.videos.length - 1
                                    ) {
                                        if (
                                            lastEpProgress &&
                                            lastEpProgress.watched
                                        ) {
                                            const nextEp =
                                                metaData.meta.videos[
                                                    nextEpIndex + 1
                                                ];
                                            episodeClicked(nextEp);
                                        } else {
                                            // Resume current
                                            episodeClicked(
                                                metaData.meta.videos[
                                                    nextEpIndex
                                                ],
                                            );
                                        }
                                    } else {
                                        episodeClicked(metaData.meta.videos[0]);
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
                                    Resume S{lastWatched.season}E{lastWatched.episode}
                                {:else if lastEpProgress && lastEpProgress.watched}
                                    {@const nextEpIndex =
                                        metaData.meta.videos.findIndex(
                                            (v) =>
                                                v.season ===
                                                    lastWatched.season &&
                                                v.episode ===
                                                    lastWatched.episode,
                                        )}
                                    {#if nextEpIndex !== -1 && nextEpIndex < metaData.meta.videos.length - 1}
                                        {@const nextEp =
                                            metaData.meta.videos[
                                                nextEpIndex + 1
                                            ]}
                                        Watch S{nextEp.season}E{nextEp.episode}
                                    {:else}
                                        Watch S1E1
                                    {/if}
                                {:else}
                                    Watch S{lastWatched.season}E{lastWatched.episode ||
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
                        {@const movieProgress = progressMap}
                        {@const isMovieResumable =
                            movieProgress &&
                            !movieProgress.watched &&
                            movieProgress.time > 0}

                        <div class="relative overflow-hidden rounded-[50px]">
                            <button
                                class="bg-[#FFFFFF]/80 hover:bg-[#D3D3D3]/80 cursor-pointer backdrop-blur-2xl flex flex-row items-center justify-center gap-[20px] text-black text-[48px] font-poppins font-medium px-[130px] py-[25px] w-full transition-colors duration-200 relative z-10"
                                on:click={() =>
                                    episodeClicked({ season: 0, episode: 0 })}
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
                    {#if metaData.meta.type === "series"}
                        <div
                            class="px-[60px] py-[40px] w-full bg-[#FFFFFF]/10 backdrop-blur-[16px] rounded-[64px] flex flex-col gap-[20px]"
                        >
                            <span
                                class="text-[#E1E1E1] text-[32px] font-poppins font-bold"
                                >0/{episodes} episodes watched</span
                            >
                            <div
                                class="w-full h-[10px] bg-[#A3A3A3]/30 rounded-full overflow-hidden"
                            >
                                <div
                                    class="h-full bg-white rounded-full"
                                    style="width: 0%"
                                ></div>
                                <div
                                    class="h-full bg-[#A3A3A3]/30 rounded-full"
                                    style="width: 100%"
                                ></div>
                            </div>
                        </div>
                    {/if}

                    <div
                        class="px-[60px] py-[40px] w-full bg-[#FFFFFF]/10 backdrop-blur-[16px] rounded-[64px] flex flex-col gap-[20px] justify-center"
                    >
                        {#if metaData.meta.type === "series"}
                            <span
                                class="text-[#E1E1E1] text-[32px] font-poppins font-bold"
                                >{episodes} episodes • {seasons} seasons</span
                            >
                        {/if}

                        <div
                            class="flex flex-row gap-[10px] items-center justify-between"
                        >
                            <span
                                class="text-[#E8E8E8]/80 text-[24px] font-poppins font-medium"
                                >{metaData.meta.year}</span
                            >

                            <div class="flex flex-row gap-[10px] items-center">
                                <span
                                    class="text-[#E8E8E8]/80 text-[24px] font-poppins font-medium"
                                    >{metaData.meta.imdbRating}</span
                                >

                                <a
                                    href={`https://www.imdb.com/title/${metaData.meta.imdb_id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="cursor-pointer hover:opacity-60 transition-opacity duration-200"
                                >
                                    <img
                                        src="/imdb.png"
                                        alt="IMDB Logo"
                                        class="h-[50px] w-auto object-contain"
                                    />
                                </a>
                            </div>
                        </div>
                    </div>

                    <ActionButtons {metaData} />
                </div>
            </div>

            {#if metaData.meta.type === "series"}
                <div
                    class="absolute bottom-0 left-0 w-full h-[150px] bg-gradient-to-t from-[#090909] to-transparent"
                ></div>

                <span
                    class="absolute bottom-10 left-1/2 transform -translate-x-1/2 text-[#E1E1E1]/60 text-[16px] font-poppins font-medium"
                    >scroll down to view episodes</span
                >
            {/if}
        </div>

        {#if metaData.meta.type === "series"}
            <div class="w-screen p-40">
                <SeasonSelector {seasonsArray} bind:currentSeason />
                <EpisodeGrid
                    {metaData}
                    {currentSeason}
                    {progressMap}
                    on:episodeClick={(e) => episodeClicked(e.detail)}
                />
            </div>
        {/if}
    </div>

    <StreamsPopup
        bind:streamsPopupVisible
        {addons}
        bind:selectedAddon
        {loadingStreams}
        {streams}
        {metaData}
        on:close={closeStreamsPopup}
        on:streamClick={(e) => onStreamClick(e.detail)}
    />

    {#if playerVisible && selectedStreamUrl}
        <div class="w-screen h-screen z-100 fixed top-0 left-0">
            <Player
                videoSrc={selectedStreamUrl}
                {metaData}
                {startTime}
                onClose={closePlayer}
                onNextEpisode={handleNextEpisode}
                onProgress={handleProgress}
            />
        </div>
    {/if}
{/if}
