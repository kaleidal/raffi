<script lang="ts">
    import { getMetaData } from "../lib/library/library";
    import type { ShowResponse } from "../lib/library/types/meta_types";
    import { onDestroy, onMount } from "svelte";
    import Player from "./Player.svelte";
    import { slide, fade } from "svelte/transition";
    import { router } from "../lib/stores/router";
    import type { Addon } from "../lib/db/db";
    import {
        getAddons,
        getLibraryItem,
        updateLibraryProgress,
    } from "../lib/db/db";

    import SeasonSelector from "../components/meta/SeasonSelector.svelte";
    import EpisodeGrid from "../components/meta/EpisodeGrid.svelte";
    import StreamsPopup from "../components/meta/StreamsPopup.svelte";
    import ActionButtons from "../components/meta/ActionButtons.svelte";
    import EpisodeContextMenu from "../components/meta/EpisodeContextMenu.svelte";
    import LoadingSpinner from "../components/common/LoadingSpinner.svelte";
    import TorrentWarningModal from "../components/meta/TorrentWarningModal.svelte";

    let addons: Addon[] = [];

    onMount(async () => {
        try {
            const dbAddons = await getAddons();
            if (dbAddons.length > 0) {
                addons = dbAddons;
                selectedAddon = addons[0].transport_url;
            }
        } catch (e) {
            console.error("Failed to load addons", e);
        }
    });

    // Get params from router store
    $: imdbID = $router.params.imdbId;
    $: titleType = $router.params.type || "movie";
    $: expectedName = $router.params.name || "";

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
    let selectedFileIdx: number | null = null;
    let selectedAddon: string = "";
    let loadingStreams = false;
    let selectedEpisode: any = null;
    let progressMap: any = {};
    let libraryItem: any = null;

    let showTorrentWarning = false;
    let pendingTorrentStream: any = null;

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
        // Check if it's a torrent
        const isTorrent =
            stream.infoHash || (stream.url && stream.url.startsWith("magnet:"));

        if (isTorrent) {
            const hasSeenWarning = localStorage.getItem("torrentWarningShown");
            if (!hasSeenWarning) {
                pendingTorrentStream = stream;
                showTorrentWarning = true;
                return;
            }
        }

        playStream(stream);
    };

    const handleTorrentWarningConfirm = () => {
        localStorage.setItem("torrentWarningShown", "true");
        showTorrentWarning = false;
        if (pendingTorrentStream) {
            playStream(pendingTorrentStream);
            pendingTorrentStream = null;
        }
    };

    const handleTorrentWarningCancel = () => {
        showTorrentWarning = false;
        pendingTorrentStream = null;
    };

    const playStream = (stream: any) => {
        let url = stream.url;
        let fileIdx = stream.fileIdx;
        if (stream.infoHash && fileIdx !== undefined) {
            url = `magnet:?xt=urn:btih:${stream.infoHash}`;
            selectedFileIdx = fileIdx;
        }

        if (url) {
            selectedStream = stream;
            selectedStreamUrl = url;

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
                const isTorrent =
                    match.infoHash ||
                    (match.url && match.url.startsWith("magnet:"));
                if (isTorrent && !localStorage.getItem("torrentWarningShown")) {
                    pendingTorrentStream = match;
                    showTorrentWarning = true;
                    playerVisible = false;
                } else {
                    playStream(match);
                }
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
            progressMap = progressMap;
        }

        const now = Date.now();
        if (now - lastUpdate > 5000 || isWatched) {
            lastUpdate = now;
            await updateLibraryProgress(imdbID, progressMap, type, false);
        }
    };

    let showEpisodeContextMenu = false;
    let contextMenuX = 0;
    let contextMenuY = 0;
    let contextEpisode: any = null;

    function handleEpisodeContextMenu(e: MouseEvent, episode: any) {
        contextMenuX = e.clientX;
        contextMenuY = e.clientY;
        contextEpisode = episode;
        showEpisodeContextMenu = true;
    }

    function handleContextWatch() {
        if (contextEpisode) {
            episodeClicked(contextEpisode);
        }
    }

    async function handleContextMarkWatched() {
        if (!contextEpisode || !imdbID) return;
        const key = `${contextEpisode.season}:${contextEpisode.episode}`;
        const existing = progressMap[key] || {};
        const duration = existing.duration || 0;

        progressMap[key] = {
            time: duration,
            duration: duration,
            watched: true,
            updatedAt: Date.now(),
        };
        progressMap = progressMap;
        await updateLibraryProgress(
            imdbID,
            progressMap,
            metaData.meta.type,
            false,
        );
    }

    async function handleContextMarkUnwatched() {
        if (!contextEpisode || !imdbID) return;
        const key = `${contextEpisode.season}:${contextEpisode.episode}`;
        const existing = progressMap[key] || {};

        progressMap[key] = {
            ...existing,
            time: 0,
            watched: false,
            updatedAt: Date.now(),
        };
        progressMap = progressMap;
        await updateLibraryProgress(
            imdbID,
            progressMap,
            metaData.meta.type,
            false,
        );
    }

    async function handleContextResetProgress() {
        if (!contextEpisode || !imdbID) return;
        const key = `${contextEpisode.season}:${contextEpisode.episode}`;

        if (progressMap[key]) {
            delete progressMap[key];
            progressMap = progressMap;
            await updateLibraryProgress(
                imdbID,
                progressMap,
                metaData.meta.type,
                false,
            );
        }
    }

    async function handleContextMarkSeasonWatched() {
        if (!contextEpisode || !imdbID || !metaData) return;
        const season = contextEpisode.season;
        const episodesInSeason = metaData.meta.videos.filter(
            (v) => v.season === season,
        );

        for (const ep of episodesInSeason) {
            const key = `${ep.season}:${ep.episode}`;
            const existing = progressMap[key] || {};
            const duration = existing.duration || 0;

            progressMap[key] = {
                time: duration,
                duration: duration,
                watched: true,
                updatedAt: Date.now(),
            };
        }
        progressMap = progressMap;
        await updateLibraryProgress(
            imdbID,
            progressMap,
            metaData.meta.type,
            false,
        );
    }

    async function handleContextMarkSeasonUnwatched() {
        if (!contextEpisode || !imdbID || !metaData) return;
        const season = contextEpisode.season;
        const episodesInSeason = metaData.meta.videos.filter(
            (v) => v.season === season,
        );

        for (const ep of episodesInSeason) {
            const key = `${ep.season}:${ep.episode}`;
            const existing = progressMap[key] || {};

            progressMap[key] = {
                ...existing,
                time: 0,
                watched: false,
                updatedAt: Date.now(),
            };
        }
        progressMap = progressMap;
        await updateLibraryProgress(
            imdbID,
            progressMap,
            metaData.meta.type,
            false,
        );
    }

    $: if (selectedAddon && selectedEpisode) {
        if (streamsPopupVisible) {
            fetchStreams(selectedEpisode);
        }
    }

    const loadData = async () => {
        if (!imdbID) return;
        loadedMeta = false;
        try {
            metaData = await getMetaData(imdbID, titleType);

            if (expectedName && metaData.meta.name !== expectedName) {
                console.warn(
                    `Name mismatch: expected "${expectedName}", got "${metaData.meta.name}". Trying fallback type.`,
                );
                const fallbackType = titleType === "movie" ? "series" : "movie";
                metaData = await getMetaData(imdbID, fallbackType);
                titleType = fallbackType;
            }

            if (!metaData.meta.logo || !metaData.meta.background) {
                console.warn(
                    "Missing logo or background. Trying fallback type.",
                );
                const fallbackType = titleType === "movie" ? "series" : "movie";
                metaData = await getMetaData(imdbID, fallbackType);
                titleType = fallbackType;
            }
        } catch (e) {
            console.warn(
                `Failed to load meta for ${titleType}, trying fallback`,
            );
            try {
                const fallbackType = titleType === "movie" ? "series" : "movie";
                metaData = await getMetaData(imdbID, fallbackType);
                titleType = fallbackType;
            } catch (e2) {
                console.error("Failed to load meta (fallback)", e2);
            }
        }
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
    <div class="bg-[#090909] flex-1" in:fade={{ duration: 300 }}>
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
                        {@const watchedCount = Object.values(
                            progressMap,
                        ).filter((p: any) => p && p.watched).length}
                        {@const progressPercent =
                            episodes > 0 ? (watchedCount / episodes) * 100 : 0}
                        <div
                            class="px-[60px] py-[40px] w-full bg-[#FFFFFF]/10 backdrop-blur-[16px] rounded-[64px] flex flex-col gap-[20px]"
                        >
                            <span
                                class="text-[#E1E1E1] text-[32px] font-poppins font-bold"
                                >{watchedCount}/{episodes} episodes watched</span
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
                                        src="imdb.png"
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
                    on:episodeContextMenu={(e) =>
                        handleEpisodeContextMenu(
                            e.detail.event,
                            e.detail.episode,
                        )}
                />
            </div>
        {/if}
    </div>

    {#if showEpisodeContextMenu}
        <EpisodeContextMenu
            x={contextMenuX}
            y={contextMenuY}
            on:close={() => (showEpisodeContextMenu = false)}
            on:watch={handleContextWatch}
            on:markWatched={handleContextMarkWatched}
            on:markUnwatched={handleContextMarkUnwatched}
            on:resetProgress={handleContextResetProgress}
            on:markSeasonWatched={handleContextMarkSeasonWatched}
            on:markSeasonUnwatched={handleContextMarkSeasonUnwatched}
        />
    {/if}

    {#if showTorrentWarning}
        <TorrentWarningModal
            on:confirm={handleTorrentWarningConfirm}
            on:cancel={handleTorrentWarningCancel}
        />
    {/if}

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
                fileIdx={selectedFileIdx}
                {metaData}
                {startTime}
                onClose={closePlayer}
                onNextEpisode={handleNextEpisode}
                onProgress={handleProgress}
                season={selectedEpisode?.season}
                episode={selectedEpisode?.episode}
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
