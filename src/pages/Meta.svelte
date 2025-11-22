<script lang="ts">
    import { getMetaData } from "../lib/library/library";
    import type { ShowResponse } from "../lib/library/types/meta_types";
    import { onDestroy, onMount } from "svelte";
    import Player from "./Player.svelte";
    import { slide, fade } from "svelte/transition";
    import { router } from "../lib/stores/router";

    let addons: string[] = [
        "https://torrentio.strem.fun/language=german,serbian,croatian|qualityfilter=scr,cam|limit=1|debridoptions=nodownloadlinks|realdebrid=LMDSM5K2GLBR4BG6MT6JBPYHR7C5HZP2RAUCCNL4ZIS7236LV2LA/",
    ];

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

    const truncateWords = (text: string, maxWords: number) => {
        if (!text) return "";
        const words = text.split(/\s+/);
        if (words.length <= maxWords) return text;
        return words.slice(0, maxWords).join(" ") + "…";
    };

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
                selectedAddon + "stream/" + type + "/" + streamId + ".json",
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

    const onStreamClick = (stream: any) => {
        // stream.url or stream.ytId or stream.infoHash
        // For now assuming stream.url as torrenting hasn't been implemented yet.
        if (stream.url) {
            selectedStream = stream;
            selectedStreamUrl = stream.url;
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

        // episodes is the total number of episodes starting from season 1, skip season 0 which is the special episodes
        episodes = metaData.meta.videos.filter(
            (video) => video.season > 0,
        ).length;

        seasons = Math.max(
            ...metaData.meta.videos.map((video) => video.season),
        );

        seasonsArray = [];
        for (let i = 1; i <= seasons; i++) {
            seasonsArray.push(i);
        }
    };

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
                on:click={() => router.navigate("home")}
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

                    <button
                        class="bg-[#FFFFFF]/80 hover:bg-[#D3D3D3]/80 cursor-pointer backdrop-blur-2xl flex flex-row items-center justify-center gap-[20px] text-black text-[48px] font-poppins font-medium px-[130px] py-[25px] rounded-[50px] mt-10 transition-colors duration-200"
                        on:click={() => {
                            if (metaData.meta.type === "movie") {
                                episodeClicked({});
                            } else {
                                const nextEpIndex =
                                    metaData.meta.videos.findIndex(
                                        (v) =>
                                            v.season === lastWatched.season &&
                                            v.episode === lastWatched.episode,
                                    );
                                if (
                                    nextEpIndex !== -1 &&
                                    nextEpIndex <
                                        metaData.meta.videos.length - 1
                                ) {
                                    const nextEp =
                                        metaData.meta.videos[nextEpIndex + 1];
                                    episodeClicked(nextEp);
                                } else {
                                    episodeClicked(metaData.meta.videos[0]);
                                }
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

                        Watch {metaData.meta.type === "movie"
                            ? "Movie"
                            : "S1E1"}
                    </button>
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

                    <div class="flex flex-row gap-[20px]">
                        <button
                            class="px-[50px] py-[20px] flex flex-row gap-[20px] items-center cursor-pointer hover:bg-[#D3D3D3]/10 transition-all duration-200 bg-[#FFFFFF]/10 backdrop-blur-[16px] rounded-[64px] justify-center"
                        >
                            <svg
                                width="30"
                                height="30"
                                viewBox="0 0 40 40"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <path
                                    d="M11.6667 3.33337H28.3333M8.33333 10H31.6667M8.33333 16.6667H31.6667C33.5076 16.6667 35 18.1591 35 20V33.3334C35 35.1743 33.5076 36.6667 31.6667 36.6667H8.33333C6.49238 36.6667 5 35.1743 5 33.3334V20C5 18.1591 6.49238 16.6667 8.33333 16.6667Z"
                                    stroke="white"
                                    stroke-width="4"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                />
                            </svg>

                            <span
                                class="text-[#E1E1E1] text-[24px] font-poppins font-medium"
                                >Add to list</span
                            >
                        </button>

                        <button
                            class="px-[50px] py-[20px] flex flex-row gap-[20px] items-center cursor-pointer hover:bg-[#D3D3D3]/10 transition-all duration-200 bg-[#FFFFFF]/10 backdrop-blur-[16px] rounded-[64px] justify-center"
                            on:click={() =>
                                window.open(
                                    `https://www.youtube.com/watch?v=${metaData.meta.trailers[0]?.source}`,
                                    "_blank",
                                )}
                        >
                            <svg
                                width="30"
                                height="30"
                                viewBox="0 0 40 40"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <path
                                    d="M11.6667 5V35M5 12.5H11.6667M5 20H35M5 27.5H11.6667M28.3333 5V35M28.3333 12.5H35M28.3333 27.5H35M8.33333 5H31.6667C33.5076 5 35 6.49238 35 8.33333V31.6667C35 33.5076 33.5076 35 31.6667 35H8.33333C6.49238 35 5 33.5076 5 31.6667V8.33333C5 6.49238 6.49238 5 8.33333 5Z"
                                    stroke="white"
                                    stroke-width="4"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                />
                            </svg>

                            <span
                                class="text-[#E1E1E1] text-[24px] font-poppins font-medium"
                                >Trailer</span
                            >
                        </button>
                    </div>
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
                <div class="flex flex-row flex-wrap gap-[20px] mb-10">
                    {#each seasonsArray as season}
                        <button
                            class="px-[30px] py-[15px] {currentSeason === season
                                ? 'bg-[#FFFFFF]/20 hover:bg-[#D3D3D3]/20'
                                : 'bg-[#FFFFFF]/10 hover:bg-[#D3D3D3]/10'} backdrop-blur-2xl rounded-full text-[#E1E1E1] text-[20px] font-poppins font-medium cursor-pointer transition-colors duration-200"
                            on:click={() => (currentSeason = season)}
                        >
                            Season {season}
                        </button>
                    {/each}
                </div>

                <div class="grid grid-cols-4 gap-[30px]">
                    {#each metaData.meta.videos.filter((video) => video.season === currentSeason) as episode}
                        <button
                            class="bg-[#121212] rounded-[20px] overflow-hidden cursor-pointer hover:opacity-80 transition-opacity duration-200 relative"
                            on:click={() => episodeClicked(episode)}
                        >
                            <div
                                class="w-full h-[150px] bg-gradient-to-t from-[#090909] to-transparent absolute bottom-0 left-0"
                            ></div>

                            {#if episode.thumbnail}
                                <img
                                    src={episode.thumbnail}
                                    alt="Episode Thumbnail"
                                    class="w-full h-full object-cover aspect-video"
                                />
                            {:else}
                                <div
                                    class="w-full aspect-video bg-[#1a1a1a] flex items-center justify-center"
                                >
                                    <svg
                                        width="40"
                                        height="40"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                        class="opacity-20"
                                    >
                                        <path
                                            d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
                                            stroke="white"
                                            stroke-width="2"
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                        />
                                        <path
                                            d="M10 8L16 12L10 16V8Z"
                                            stroke="white"
                                            stroke-width="2"
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                        />
                                    </svg>
                                </div>
                            {/if}

                            <div
                                class="p-5 flex flex-col justify-end gap-[10px] z-10 absolute w-full h-full top-0 left-0"
                            >
                                <span
                                    class="text-[#E1E1E1] text-[18px] font-poppins font-semibold"
                                    >S{episode.season}E{episode.episode} - {episode.name}</span
                                >
                                <span
                                    class="text-[#A3A3A3] text-[14px] font-poppins font-medium"
                                    >{truncateWords(
                                        episode.description ?? "",
                                        10,
                                    )}</span
                                >
                            </div>
                        </button>
                    {/each}
                </div>
            </div>
        {/if}
    </div>

    {#if streamsPopupVisible}
        <div
            class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-20"
            on:click|self={closeStreamsPopup}
            on:keydown={(e) => e.key === "Escape" && closeStreamsPopup()}
            role="button"
            tabindex="0"
            transition:fade={{ duration: 200 }}
        >
            <div
                class="bg-[#121212] w-full max-w-4xl max-h-full rounded-[32px] p-10 flex flex-col gap-6 overflow-hidden relative"
            >
                <button
                    class="absolute top-6 right-6 text-white/50 hover:text-white cursor-pointer"
                    on:click={closeStreamsPopup}
                    aria-label="Close streams"
                >
                    <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        ><line x1="18" y1="6" x2="6" y2="18"></line><line
                            x1="6"
                            y1="6"
                            x2="18"
                            y2="18"
                        ></line></svg
                    >
                </button>

                <h2 class="text-white text-2xl font-poppins font-bold">
                    Select Stream
                </h2>

                {#if addons.length > 1}
                    <div class="flex flex-row gap-4 overflow-x-auto pb-2">
                        {#each addons as addon, i}
                            <button
                                class="px-6 py-3 rounded-full text-sm font-medium transition-colors cursor-pointer whitespace-nowrap {selectedAddon ===
                                addon
                                    ? 'bg-white text-black'
                                    : 'bg-white/10 text-white hover:bg-white/20'}"
                                on:click={() => (selectedAddon = addon)}
                            >
                                Addon {i + 1}
                            </button>
                        {/each}
                    </div>
                {/if}

                <div class="flex flex-col gap-4 overflow-y-auto pr-2">
                    {#if loadingStreams}
                        <div class="text-white/50 text-center py-10">
                            Loading streams...
                        </div>
                    {:else if streams.length === 0}
                        <div class="text-white/50 text-center py-10">
                            No streams found.
                        </div>
                    {:else}
                        {#each streams as stream}
                            <button
                                class="w-full bg-white/5 hover:bg-white/10 p-4 rounded-xl flex flex-col gap-1 text-left transition-colors group cursor-pointer"
                                on:click={() => onStreamClick(stream)}
                            >
                                <div
                                    class="flex flex-row justify-between items-center w-full"
                                >
                                    <span class="text-white font-medium text-lg"
                                        >{truncateWords(
                                            stream.title ||
                                                (metaData.meta.type === "movie"
                                                    ? "Watch Movie"
                                                    : "Watch S1E2"),
                                            10,
                                        )}</span
                                    >
                                    <span class="text-white/50 text-sm"
                                        >{stream.name}</span
                                    >
                                </div>
                                <span class="text-white/40 text-sm line-clamp-1"
                                    >{stream.title}</span
                                >
                            </button>
                        {/each}
                    {/if}
                </div>
            </div>
        </div>
    {/if}

    {#if playerVisible && selectedStreamUrl}
        <div
            class="fixed inset-0 z-[100] bg-black"
            transition:fade={{ duration: 300 }}
        >
            <Player
                videoSrc={selectedStreamUrl}
                {metaData}
                autoPlay={true}
                onClose={closePlayer}
                onNextEpisode={handleNextEpisode}
            />
        </div>
    {/if}
{/if}
