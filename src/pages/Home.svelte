<script lang="ts">
    import { onMount } from "svelte";
    import {
        getMetaData,
        getPopularTitles,
        searchTitles,
    } from "../lib/library/library";
    import type { ShowResponse } from "../lib/library/types/meta_types";
    import ExpandingButton from "../components/ExpandingButton.svelte";
    import type { PopularTitleMeta } from "../lib/library/types/popular_types";
    import { router } from "../lib/stores/router";
    import { getLibrary, getAddons, addAddon, removeAddon } from "../lib/db/db";
    import type { Addon } from "../lib/db/db";
    import { fade, scale } from "svelte/transition";

    let showcasedTitle: PopularTitleMeta;
    let playerIframe: HTMLIFrameElement;
    let isPaused = false;
    let isMuted = true;
    let fetchedTitles = false;

    let continueWatchingMeta: ShowResponse[] = [];

    // Addons state
    let showAddonsModal = false;
    let addonsList: Addon[] = [];
    let newAddonUrl = "";
    let loadingAddons = false;

    // Search state
    let searchQuery = "";
    let searchResults: PopularTitleMeta[] = [];
    let searchTimeout: any;
    let showSearchResults = false;

    function handleSearch(e: Event) {
        const query = (e.target as HTMLInputElement).value;
        searchQuery = query;

        clearTimeout(searchTimeout);
        if (!query.trim()) {
            searchResults = [];
            showSearchResults = false;
            return;
        }

        searchTimeout = setTimeout(async () => {
            searchResults = await searchTitles(query);
            showSearchResults = true;
        }, 500);
    }

    function closeSearch() {
        setTimeout(() => {
            showSearchResults = false;
        }, 200);
    }

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

        // Fallback if loop fails (prevent white screen, just pick one with trailer even if unchecked)
        if (!showcasedTitle) {
            const fallback = mostPopularTitles.find(
                (t) => t.trailerStreams && t.trailerStreams.length > 0,
            );
            if (fallback) showcasedTitle = fallback;
        }

        console.log(showcasedTitle);

        console.log(showcasedTitle);

        try {
            const library = await getLibrary();
            // Sort by last_watched desc
            library.sort(
                (a, b) =>
                    new Date(b.last_watched).getTime() -
                    new Date(a.last_watched).getTime(),
            );

            const recent = library.slice(0, 10);
            for (const item of recent) {
                try {
                    // We need to know type, but library doesn't store it yet.
                    // We can try fetching as series first (most likely for continue watching) or try both.
                    // For now, let's assume we can fetch meta without type or try guessing.
                    // Actually getMetaData requires type.
                    // Strategy: try series, if fails try movie? Or just store type in library?
                    // For now, let's try both or just assume series for "episodes" logic, but movies also have progress.
                    // Let's try fetching as series, if error, fetch as movie.

                    let meta: ShowResponse;
                    try {
                        meta = await getMetaData(item.imdb_id, "series");
                    } catch {
                        meta = await getMetaData(item.imdb_id, "movie");
                    }
                    continueWatchingMeta.push(meta);
                    continueWatchingMeta = continueWatchingMeta; // trigger update
                } catch (e) {
                    console.error(`Failed to load meta for ${item.imdb_id}`, e);
                }
            }
        } catch (e) {
            console.error("Failed to load library", e);
        }

        fetchedTitles = true;
    });

    async function openAddons() {
        showAddonsModal = true;
        loadAddons();
    }

    async function loadAddons() {
        loadingAddons = true;
        try {
            addonsList = await getAddons();
        } catch (e) {
            console.error("Failed to load addons", e);
        } finally {
            loadingAddons = false;
        }
    }

    async function handleAddAddon() {
        if (!newAddonUrl) return;
        if (
            !newAddonUrl.startsWith("http://") &&
            !newAddonUrl.startsWith("https://")
        ) {
            if (newAddonUrl.startsWith("stremio://")) {
                newAddonUrl = newAddonUrl.replace("stremio://", "https://");
            } else {
                alert("Invalid URL");
                return;
            }
        }

        if (!newAddonUrl.endsWith("/manifest.json")) {
            newAddonUrl += "/manifest.json";
        }

        const response = await fetch(newAddonUrl);
        const manifest = await response.json();
        if (!manifest) {
            alert("Invalid manifest");
            return;
        }

        try {
            await addAddon({
                transport_url: newAddonUrl.replace("/manifest.json", ""),
                manifest: manifest,
                flags: { protected: false, official: false },
            });
            newAddonUrl = "";
            await loadAddons();
        } catch (e) {
            console.error("Failed to add addon", e);
            alert("Failed to add addon");
        }
    }

    async function handleRemoveAddon(url: string) {
        if (!confirm("Are you sure?")) return;
        try {
            await removeAddon(url);
            await loadAddons();
        } catch (e) {
            console.error("Failed to remove addon", e);
        }
    }

    function togglePlay() {
        if (!playerIframe) return;
        const command = isPaused ? "playVideo" : "pauseVideo";
        playerIframe.contentWindow?.postMessage(
            JSON.stringify({ event: "command", func: command, args: [] }),
            "*",
        );
        isPaused = !isPaused;
    }

    function toggleMute() {
        if (!playerIframe) return;
        const command = isMuted ? "unMute" : "mute";
        playerIframe.contentWindow?.postMessage(
            JSON.stringify({ event: "command", func: command, args: [] }),
            "*",
        );
        isMuted = !isMuted;
    }

    function navigateToMeta(imdbId: string, type: string) {
        router.navigate("meta", { imdbId, type });
    }
</script>

{#if fetchedTitles}
    <div class="bg-[#090909] h-fit min-h-screen flex flex-col pb-[100px]">
        <div class="w-screen h-[80vh] relative overflow-hidden">
            <div
                class="absolute top-0 left-0 w-full p-[50px] flex flex-row justify-between items-center z-50"
            >
                <img src="/raffi.svg" alt="Raffi Logo" class="h-[100px]" />

                <div class="flex flex-col relative">
                    <div
                        class="flex flex-row gap-0 rounded-full overflow-clip w-fit backdrop-blur-md z-20"
                    >
                        <div class="p-[20px] bg-[#181818]/50">
                            <svg
                                width="40"
                                height="40"
                                viewBox="0 0 40 40"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <path
                                    d="M35 35L27.7667 27.7667M31.6667 18.3333C31.6667 25.6971 25.6971 31.6667 18.3333 31.6667C10.9695 31.6667 5 25.6971 5 18.3333C5 10.9695 10.9695 5 18.3333 5C25.6971 5 31.6667 10.9695 31.6667 18.3333Z"
                                    stroke="#C3C3C3"
                                    stroke-width="3"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                />
                            </svg>
                        </div>

                        <input
                            type="text"
                            placeholder="search for a movie or show"
                            class="bg-[#000000]/50 text-[#D4D4D4] text-center py-[20px] text-[28px] font-poppins font-medium w-fit outline-none focus:outline-none focus:ring-0"
                            on:input={handleSearch}
                            on:focus={() => {
                                if (searchQuery) showSearchResults = true;
                            }}
                            on:blur={closeSearch}
                            value={searchQuery}
                        />
                    </div>

                    {#if showSearchResults && searchResults.length > 0}
                        <div
                            class="absolute top-[90px] left-0 w-full bg-[#181818]/90 backdrop-blur-xl rounded-[24px] p-4 flex flex-col gap-2 max-h-[400px] overflow-y-auto z-100"
                        >
                            {#each searchResults as result}
                                <button
                                    class="flex flex-row gap-4 items-center p-2 hover:bg-white/10 rounded-xl transition-colors cursor-pointer text-left"
                                    on:click={() =>
                                        navigateToMeta(
                                            result.imdb_id,
                                            result.type,
                                        )}
                                >
                                    <img
                                        src={result.poster}
                                        alt={result.name}
                                        class="w-[40px] h-[60px] object-cover rounded-md bg-black/50"
                                    />
                                    <div class="flex flex-col">
                                        <span
                                            class="text-white font-poppins font-medium text-lg line-clamp-1"
                                            >{result.name}</span
                                        >
                                        <span
                                            class="text-white/50 font-poppins text-sm"
                                            >{result.year || ""} • {result.type}</span
                                        >
                                    </div>
                                </button>
                            {/each}
                        </div>
                    {/if}
                </div>

                <div class="flex flex-row gap-[10px]">
                    <button
                        class="bg-[#2C2C2C]/80 p-[20px] rounded-[24px] hover:bg-[#2C2C2C]/50 transition-colors duration-300 cursor-pointer"
                        aria-label="addons"
                        on:click={openAddons}
                    >
                        <svg
                            width="40"
                            height="40"
                            viewBox="0 0 40 40"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path
                                d="M25.65 7.31667C25.8595 7.52639 26.1211 7.67643 26.4079 7.75134C26.6948 7.82624 26.9964 7.82329 27.2817 7.7428C27.5669 7.66231 27.8256 7.50718 28.031 7.29341C28.2363 7.07964 28.381 6.81496 28.45 6.52667C28.623 5.8065 28.9848 5.14546 29.4983 4.61163C30.0117 4.0778 30.6581 3.69048 31.371 3.48954C32.0839 3.28861 32.8374 3.28133 33.5541 3.46846C34.2707 3.65558 34.9245 4.03035 35.4481 4.55416C35.9718 5.07797 36.3463 5.7319 36.5332 6.44859C36.7201 7.16528 36.7126 7.91884 36.5114 8.63166C36.3102 9.34447 35.9227 9.99078 35.3887 10.504C34.8547 11.0173 34.1935 11.3789 33.4733 11.5517C33.185 11.6207 32.9203 11.7653 32.7066 11.9707C32.4928 12.176 32.3377 12.4347 32.2572 12.72C32.1767 13.0053 32.1737 13.3069 32.2486 13.5937C32.3235 13.8805 32.4736 14.1422 32.6833 14.3517L35.4883 17.155C35.8619 17.5286 36.1583 17.9721 36.3605 18.4603C36.5627 18.9484 36.6668 19.4716 36.6668 20C36.6668 20.5284 36.5627 21.0516 36.3605 21.5397C36.1583 22.0279 35.8619 22.4714 35.4883 22.845L32.6833 25.65C32.4738 25.8597 32.2122 26.0098 31.9253 26.0847C31.6385 26.1596 31.3369 26.1566 31.0516 26.0761C30.7663 25.9956 30.5077 25.8405 30.3023 25.6267C30.0969 25.413 29.9523 25.1483 29.8833 24.86C29.7103 24.1398 29.3485 23.4788 28.835 22.945C28.3216 22.4111 27.6752 22.0238 26.9623 21.8229C26.2494 21.6219 25.4958 21.6147 24.7792 21.8018C24.0626 21.9889 23.4088 22.3637 22.8851 22.8875C22.3615 23.4113 21.987 24.0652 21.8001 24.7819C21.6132 25.4986 21.6207 26.2522 21.8219 26.965C22.0231 27.6778 22.4106 28.3241 22.9446 28.8374C23.4786 29.3506 24.1398 29.7122 24.86 29.885C25.1483 29.954 25.4129 30.0986 25.6267 30.304C25.8405 30.5094 25.9956 30.768 26.0761 31.0533C26.1566 31.3386 26.1595 31.6402 26.0846 31.927C26.0097 32.2139 25.8597 32.4755 25.65 32.685L22.845 35.4883C22.4714 35.862 22.0278 36.1583 21.5397 36.3605C21.0515 36.5627 20.5283 36.6668 20 36.6668C19.4716 36.6668 18.9484 36.5627 18.4603 36.3605C17.9721 36.1583 17.5286 35.862 17.155 35.4883L14.35 32.6833C14.1405 32.4736 13.8788 32.3236 13.592 32.2487C13.3052 32.1738 13.0036 32.1767 12.7183 32.2572C12.433 32.3377 12.1743 32.4928 11.969 32.7066C11.7636 32.9204 11.619 33.185 11.55 33.4733C11.377 34.1935 11.0151 34.8545 10.5017 35.3884C9.98828 35.9222 9.34184 36.3095 8.62895 36.5105C7.91607 36.7114 7.16251 36.7187 6.44588 36.5316C5.72925 36.3444 5.07545 35.9697 4.55181 35.4458C4.02817 34.922 3.65362 34.2681 3.46673 33.5514C3.27985 32.8347 3.28737 32.0812 3.48855 31.3684C3.68972 30.6555 4.07726 30.0092 4.61126 29.496C5.14526 28.9827 5.80641 28.6211 6.52664 28.4483C6.81493 28.3793 7.07961 28.2347 7.29338 28.0293C7.50715 27.824 7.66228 27.5653 7.74277 27.28C7.82326 26.9947 7.82621 26.6931 7.75131 26.4063C7.6764 26.1195 7.52636 25.8578 7.31664 25.6483L4.51164 22.845C4.13802 22.4714 3.84164 22.0279 3.63944 21.5397C3.43724 21.0516 3.33316 20.5284 3.33316 20C3.33316 19.4716 3.43724 18.9484 3.63944 18.4603C3.84164 17.9721 4.13802 17.5286 4.51164 17.155L7.31664 14.35C7.52615 14.1403 7.78779 13.9902 8.07461 13.9153C8.36142 13.8404 8.66302 13.8434 8.94832 13.9239C9.23361 14.0044 9.49228 14.1595 9.69764 14.3733C9.90301 14.587 10.0476 14.8517 10.1166 15.14C10.2897 15.8602 10.6515 16.5212 11.1649 17.055C11.6783 17.5889 12.3248 17.9762 13.0377 18.1771C13.7505 18.3781 14.5041 18.3853 15.2207 18.1982C15.9374 18.0111 16.5912 17.6363 17.1148 17.1125C17.6384 16.5887 18.013 15.9348 18.1999 15.2181C18.3868 14.5014 18.3792 13.7478 18.1781 13.035C17.9769 12.3222 17.5894 11.6759 17.0554 11.1626C16.5214 10.6494 15.8602 10.2878 15.14 10.115C14.8517 10.046 14.587 9.90137 14.3732 9.69601C14.1595 9.49064 14.0043 9.23198 13.9238 8.94668C13.8434 8.66138 13.8404 8.35978 13.9153 8.07297C13.9902 7.78616 14.1403 7.52451 14.35 7.315L17.155 4.51167C17.5286 4.13805 17.9721 3.84167 18.4603 3.63947C18.9484 3.43726 19.4716 3.33319 20 3.33319C20.5283 3.33319 21.0515 3.43726 21.5397 3.63947C22.0278 3.84167 22.4714 4.13805 22.845 4.51167L25.65 7.31667Z"
                                stroke="#C3C3C3"
                                stroke-width="3"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            />
                        </svg>
                    </button>

                    <button
                        class="bg-[#2C2C2C]/80 p-[20px] rounded-[24px] hover:bg-[#2C2C2C]/50 transition-colors duration-300 cursor-pointer"
                        aria-label="profile"
                    >
                        <svg
                            width="40"
                            height="40"
                            viewBox="0 0 40 40"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path
                                d="M31.6667 35V31.6667C31.6667 29.8986 30.9643 28.2029 29.7141 26.9526C28.4638 25.7024 26.7682 25 25 25H15C13.2319 25 11.5362 25.7024 10.286 26.9526C9.03575 28.2029 8.33337 29.8986 8.33337 31.6667V35M26.6667 11.6667C26.6667 15.3486 23.6819 18.3333 20 18.3333C16.3181 18.3333 13.3334 15.3486 13.3334 11.6667C13.3334 7.98477 16.3181 5 20 5C23.6819 5 26.6667 7.98477 26.6667 11.6667Z"
                                stroke="#C3C3C3"
                                stroke-width="3"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            />
                        </svg>
                    </button>
                </div>
            </div>

            <div
                class="absolute bottom-[100px] left-[100px] z-10 flex flex-col gap-[50px]"
            >
                <img
                    src={showcasedTitle.logo ?? ""}
                    alt="Logo"
                    class="w-[600px] h-fit"
                />

                <div class="flex flex-row gap-[10px] items-center">
                    <button
                        class="bg-[#FFFFFF]/80 hover:bg-[#D3D3D3]/80 cursor-pointer backdrop-blur-2xl flex flex-row items-center justify-center gap-[20px] text-black text-[36px] font-poppins font-medium px-[100px] py-[20px] w-fit rounded-[50px] transition-colors duration-200"
                        on:click={() =>
                            navigateToMeta(
                                showcasedTitle.imdb_id,
                                showcasedTitle.type,
                            )}
                    >
                        <svg
                            width="48"
                            height="48"
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

                        Watch now
                    </button>

                    <ExpandingButton
                        label={isPaused ? "Play" : "Pause"}
                        onClick={togglePlay}
                    >
                        {#if isPaused}
                            <svg
                                width="24"
                                height="24"
                                viewBox="0 0 24 24"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <path
                                    d="M5 3L19 12L5 21V3Z"
                                    stroke="#E9E9E9"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                />
                            </svg>
                        {:else}
                            <svg
                                width="24"
                                height="24"
                                viewBox="0 0 24 24"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <path
                                    d="M19.5833 1H16.75C15.9676 1 15.3333 1.61561 15.3333 2.375V21.625C15.3333 22.3844 15.9676 23 16.75 23H19.5833C20.3657 23 21 22.3844 21 21.625V2.375C21 1.61561 20.3657 1 19.5833 1Z"
                                    stroke="#E9E9E9"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                />
                                <path
                                    d="M8.25 1H5.41667C4.63426 1 4 1.61561 4 2.375V21.625C4 22.3844 4.63426 23 5.41667 23H8.25C9.0324 23 9.66667 22.3844 9.66667 21.625V2.375C9.66667 1.61561 9.0324 1 8.25 1Z"
                                    stroke="#E9E9E9"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                />
                            </svg>
                        {/if}
                    </ExpandingButton>

                    <ExpandingButton
                        label={isMuted ? "Unmute" : "Mute"}
                        onClick={toggleMute}
                    >
                        {#if isMuted}
                            <svg
                                width="24"
                                height="24"
                                viewBox="0 0 24 24"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <path
                                    d="M11 5L6 9H2V15H6L11 19V5Z"
                                    stroke="#E9E9E9"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                />
                                <path
                                    d="M23 9L17 15"
                                    stroke="#E9E9E9"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                />
                                <path
                                    d="M17 9L23 15"
                                    stroke="#E9E9E9"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                />
                            </svg>
                        {:else}
                            <svg
                                width="24"
                                height="24"
                                viewBox="0 0 24 24"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <path
                                    d="M16 9.00003C16.6491 9.86551 17 10.9182 17 12C17 13.0819 16.6491 14.1345 16 15M19.364 18.364C20.1997 17.5283 20.8627 16.5361 21.315 15.4442C21.7673 14.3523 22.0001 13.1819 22.0001 12C22.0001 10.8181 21.7673 9.64779 21.315 8.55585C20.8627 7.46391 20.1997 6.47176 19.364 5.63603M11 4.70203C10.9998 4.56274 10.9583 4.42663 10.8809 4.31088C10.8034 4.19514 10.6934 4.10493 10.5647 4.05166C10.436 3.99838 10.2944 3.98442 10.1577 4.01154C10.0211 4.03866 9.89559 4.10564 9.797 4.20403L6.413 7.58703C6.2824 7.7184 6.12703 7.82256 5.95589 7.89345C5.78475 7.96435 5.60124 8.00057 5.416 8.00003H3C2.73478 8.00003 2.48043 8.10539 2.29289 8.29292C2.10536 8.48046 2 8.73481 2 9.00003V15C2 15.2652 2.10536 15.5196 2.29289 15.7071C2.48043 15.8947 2.73478 16 3 16H5.416C5.60124 15.9995 5.78475 16.0357 5.95589 16.1066C6.12703 16.1775 6.2824 16.2817 6.413 16.413L9.796 19.797C9.8946 19.8958 10.0203 19.9631 10.1572 19.9904C10.2941 20.0177 10.436 20.0037 10.5649 19.9503C10.6939 19.8968 10.804 19.8063 10.8815 19.6902C10.959 19.5741 11.0002 19.4376 11 19.298V4.70203Z"
                                    stroke="#E9E9E9"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                />
                            </svg>
                        {/if}
                    </ExpandingButton>
                </div>
            </div>

            <div
                class="absolute inset-0 w-full h-full scale-[1.35] pointer-events-none"
            >
                <iframe
                    bind:this={playerIframe}
                    frameborder="0"
                    src={`https://www.youtube.com/embed/${showcasedTitle.trailerStreams!.at(-1)!.ytId}?controls=0&modestbranding=1&rel=0&autoplay=1&mute=1&loop=1&playlist=${showcasedTitle.trailerStreams!.at(-1)!.ytId}&showinfo=0&iv_load_policy=3&disablekb=1&enablejsapi=1`}
                    class="w-full h-full object-cover"
                    title="Trailer"
                ></iframe>
            </div>
            <div
                class="absolute inset-0 bg-gradient-to-t from-[#090909] via-transparent to-transparent"
            ></div>
            <div
                class="absolute inset-0 bg-gradient-to-r from-[#090909]/80 via-transparent to-transparent"
            ></div>
        </div>

        <div class="w-full z-10 h-fit p-[100px] pt-[50px]">
            {#if continueWatchingMeta.length > 0}
                <div class="w-full h-fit flex flex-col gap-4">
                    <div class="flex flex-row gap-[10px] items-center">
                        <svg
                            width="50"
                            height="50"
                            viewBox="0 0 50 50"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path
                                d="M12.5 6.25L41.6667 25L12.5 43.75V6.25Z"
                                stroke="#E0E0E6"
                                stroke-width="4"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            />
                        </svg>

                        <h1
                            class="font-poppins text-[#E0E0E6] font-medium text-[48px]"
                        >
                            Jump back into it
                        </h1>
                    </div>
                    <div class="flex flex-row gap-[20px]">
                        {#each continueWatchingMeta as title}
                            <button
                                class="w-[200px] h-fit rounded-[16px] hover:opacity-80 transition-all duration-200 ease-out cursor-pointer overflow-clip"
                                on:click={() =>
                                    navigateToMeta(
                                        title.meta.imdb_id,
                                        title.meta.type,
                                    )}
                            >
                                <img
                                    src={title.meta.poster}
                                    alt=""
                                    class="w-full h-full object-cover"
                                />
                            </button>
                        {/each}
                    </div>
                </div>
            {/if}
        </div>
    </div>
    {#if showAddonsModal}
        <div
            class="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-20"
            transition:fade={{ duration: 200 }}
            on:click|self={() => (showAddonsModal = false)}
            on:keydown={(e) => e.key === "Escape" && (showAddonsModal = false)}
            role="button"
            tabindex="0"
        >
            <div
                class="bg-[#181818] w-full max-w-2xl rounded-[32px] p-10 flex flex-col gap-6 relative"
                transition:scale={{ start: 0.95, duration: 200 }}
            >
                <div class="flex justify-between items-center">
                    <h2 class="text-white text-2xl font-poppins font-bold">
                        Manage Addons
                    </h2>
                    <button
                        class="text-white/50 hover:text-white cursor-pointer"
                        on:click={() => (showAddonsModal = false)}
                        aria-label="Close modal"
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
                </div>

                <div class="flex flex-col gap-4">
                    <div class="flex gap-2">
                        <input
                            type="text"
                            placeholder="Enter addon URL"
                            class="flex-1 bg-white/5 rounded-xl px-4 py-3 text-white outline-none focus:border-white/30"
                            bind:value={newAddonUrl}
                        />
                        <button
                            class="bg-white text-black px-6 py-3 rounded-xl font-medium hover:bg-white/90 transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                            on:click={handleAddAddon}
                            disabled={!newAddonUrl}
                        >
                            Add
                        </button>
                    </div>

                    <div
                        class="flex flex-col gap-2 max-h-[400px] overflow-y-auto"
                    >
                        {#if loadingAddons}
                            <div class="text-center text-white/50 py-4">
                                Loading...
                            </div>
                        {:else if addonsList.length === 0}
                            <div class="text-center text-white/50 py-4">
                                No addons installed
                            </div>
                        {:else}
                            {#each addonsList as addon}
                                <div
                                    class="flex justify-between items-center bg-white/5 p-4 rounded-xl"
                                >
                                    <div
                                        class="flex flex-row gap-[20px] items-center"
                                    >
                                        <img
                                            src={addon.manifest.logo}
                                            alt=""
                                            class="w-12 h-12"
                                        />
                                        <span
                                            class="text-white/80 text-[20px] truncate flex-1 mr-4"
                                            >{addon.manifest.name}</span
                                        >
                                    </div>
                                    <button
                                        class="text-red-400 hover:text-red-300 p-2 cursor-pointer"
                                        on:click={() =>
                                            handleRemoveAddon(
                                                addon.transport_url,
                                            )}
                                        aria-label="Remove addon"
                                    >
                                        <svg
                                            width="20"
                                            height="20"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            stroke-width="2"
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            ><polyline points="3 6 5 6 21 6"
                                            ></polyline><path
                                                d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                                            ></path></svg
                                        >
                                    </button>
                                </div>
                            {/each}
                        {/if}
                    </div>
                </div>
            </div>
        </div>
    {/if}
{/if}
