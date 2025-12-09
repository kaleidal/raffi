<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { searchTitles } from "../../lib/library/library";
    import { getCachedMetaData } from "../../lib/library/metaCache";
    import { router } from "../../lib/stores/router";
    import Skeleton from "../common/Skeleton.svelte";
    import { fade } from "svelte/transition";
    import TitleContextMenu from "./context_menus/TitleContextMenu.svelte";
    import ListsPopup from "../meta/modals/ListsPopup.svelte";
    import PlayModal from "./modals/PlayModal.svelte";

    const dispatch = createEventDispatcher();

    let searchQuery = "";
    let searchResults: any[] = [];
    let searchTimeout: any;
    let showSearchResults = false;
    let loading = false;
    export let absolute: boolean = true;
    export let onLogoClick: () => void = () => {};

    // Context Menu State
    let showContextMenu = false;
    let contextMenuX = 0;
    let contextMenuY = 0;
    let selectedImdbId = "";
    let selectedType = "movie"; // Default to movie for search results
    let selectedTitle = ""; // Store title for verification
    let showListsPopup = false;
    let showPlayModal = false;

    function handleSearch(e: Event) {
        const query = (e.target as HTMLInputElement).value;
        searchQuery = query;

        clearTimeout(searchTimeout);
        if (!query.trim()) {
            searchResults = [];
            showSearchResults = false;
            loading = false;
            return;
        }

        loading = true;
        showSearchResults = true;

        searchTimeout = setTimeout(async () => {
            try {
                searchResults = await searchTitles(query);
            } catch (e) {
                console.error("Search failed", e);
                searchResults = [];
            } finally {
                loading = false;
            }
        }, 500);
    }

    function closeSearch() {
        // Delay closing to allow clicks on results or context menu
        setTimeout(() => {
            // Only close if we're not interacting with context menu or popup
            if (!showContextMenu && !showListsPopup) {
                showSearchResults = false;
            }
        }, 200);
    }

    function navigateToMeta(imdbId: string, type: string, name: string) {
        router.navigate("meta", { imdbId, type, name });
    }

    function openAddons() {
        dispatch("openAddons");
    }

    function handleContextMenu(
        e: MouseEvent,
        imdbId: string,
        type: string,
        title: string,
    ) {
        contextMenuX = e.clientX;
        contextMenuY = e.clientY;
        selectedImdbId = imdbId;
        selectedType = type;
        selectedTitle = title;
        showContextMenu = true;
    }

    async function handleAddToList() {
        showContextMenu = false;

        // Verify type before showing popup
        // Search results default to "movie", but might be "series"
        // We use the same heuristic as Meta page
        try {
            let metaData = await getCachedMetaData(
                selectedImdbId,
                selectedType,
            );

            let typeChanged = false;
            if (selectedTitle && metaData.meta.name !== selectedTitle) {
                console.warn(
                    `Name mismatch: expected "${selectedTitle}", got "${metaData.meta.name}". Trying fallback type.`,
                );
                typeChanged = true;
            } else if (!metaData.meta.logo && !metaData.meta.background) {
                console.warn(
                    "Missing logo or background. Trying fallback type.",
                );
                typeChanged = true;
            }

            if (typeChanged) {
                const fallbackType =
                    selectedType === "movie" ? "series" : "movie";
                try {
                    const fallbackMeta = await getCachedMetaData(
                        selectedImdbId,
                        fallbackType,
                    );
                    if (fallbackMeta && fallbackMeta.meta) {
                        selectedType = fallbackType;
                    }
                } catch (e) {
                    console.error("Failed to load fallback meta", e);
                }
            }
        } catch (e) {
            console.warn(
                `Failed to load meta for ${selectedType}, trying fallback`,
            );
            try {
                const fallbackType =
                    selectedType === "movie" ? "series" : "movie";
                const fallbackMeta = await getCachedMetaData(
                    selectedImdbId,
                    fallbackType,
                );
                if (fallbackMeta && fallbackMeta.meta) {
                    selectedType = fallbackType;
                }
            } catch (e2) {
                console.error("Failed to load meta (fallback)", e2);
            }
        }

        showListsPopup = true;
    }
</script>

<div
    class="{absolute
        ? 'absolute'
        : 'relative'} top-0 left-0 w-full p-[50px] flex flex-row justify-between items-center z-50"
>
    <button
        class="cursor-pointer hover:opacity-80 transition-opacity"
        on:click={() => {
            router.navigate("home");
            onLogoClick();
        }}
    >
        <img src="raffi.svg" alt="Raffi Logo" class="h-[80px]" />
    </button>

    <div class="flex flex-col absolute left-1/2 -translate-x-1/2">
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
                placeholder="search for anything"
                class="bg-[#000000]/50 text-[#D4D4D4] text-center py-[20px] px-[70px] w-fit text-[28px] font-poppins font-normal outline-none focus:outline-none focus:ring-0"
                on:input={handleSearch}
                on:focus={() => {
                    if (searchQuery) showSearchResults = true;
                }}
                on:blur={closeSearch}
                value={searchQuery}
            />
        </div>

        {#if showSearchResults && (searchResults.length > 0 || loading)}
            <div
                class="absolute top-[90px] left-0 w-full bg-[#181818]/90 backdrop-blur-xl rounded-[24px] p-4 flex flex-col gap-2 max-h-[400px] overflow-y-auto z-100"
                transition:fade={{ duration: 200 }}
            >
                {#if loading}
                    {#each Array(3) as _}
                        <div
                            class="flex flex-row gap-4 items-center p-2 rounded-xl"
                        >
                            <Skeleton
                                width="40px"
                                height="60px"
                                borderRadius="6px"
                            />
                            <div class="flex flex-col gap-2">
                                <Skeleton width="150px" height="20px" />
                                <Skeleton width="50px" height="14px" />
                            </div>
                        </div>
                    {/each}
                {:else}
                    {#each searchResults as result}
                        <button
                            class="flex flex-row gap-4 items-center p-2 hover:bg-white/10 rounded-xl transition-colors cursor-pointer text-left"
                            on:click={() =>
                                navigateToMeta(
                                    result["#IMDB_ID"],
                                    "movie",
                                    result["#TITLE"],
                                )}
                            on:contextmenu|preventDefault={(e) =>
                                handleContextMenu(
                                    e,
                                    result["#IMDB_ID"],
                                    "movie", // Assuming movie for now, search results might not have type
                                    result["#TITLE"],
                                )}
                        >
                            <img
                                src={result["#IMG_POSTER"]}
                                alt={result["#TITLE"]}
                                class="w-[40px] h-[60px] object-cover rounded-md bg-black/50"
                            />
                            <div class="flex flex-col">
                                <span
                                    class="text-white font-poppins font-medium text-lg line-clamp-1"
                                    >{result["#TITLE"]}</span
                                >
                                <span class="text-white/50 font-poppins text-sm"
                                    >{result["#YEAR"] || ""}</span
                                >
                            </div>
                        </button>
                    {/each}
                {/if}
            </div>
        {/if}
    </div>

    {#if showContextMenu}
        <TitleContextMenu
            x={contextMenuX}
            y={contextMenuY}
            on:close={() => (showContextMenu = false)}
            on:addToList={handleAddToList}
        />
    {/if}

    {#if showPlayModal}
        <PlayModal onClose={() => showPlayModal = false} />
    {/if}


    <ListsPopup
        bind:visible={showListsPopup}
        imdbId={selectedImdbId}
        type={selectedType}
        on:close={() => (showListsPopup = false)}
    />

    <div class="flex flex-row gap-[10px]">
        <button
            class="bg-[#2C2C2C]/80 p-[20px] rounded-[24px] hover:bg-[#2C2C2C]/50 backdrop-blur-md transition-colors duration-300 cursor-pointer"
            aria-label="addons"
            on:click={() => showPlayModal = true}
        >
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8.33337 8.33334C8.3332 7.74683 8.48778 7.17066 8.78151 6.66299C9.07524 6.15533 9.49772 5.73416 10.0063 5.442C10.5149 5.14985 11.0915 4.99705 11.678 4.99904C12.2645 5.00103 12.8401 5.15774 13.3467 5.45334L33.3417 17.1167C33.8463 17.4095 34.2652 17.8296 34.5566 18.335C34.848 18.8405 35.0016 19.4135 35.0021 19.9969C35.0026 20.5803 34.85 21.1536 34.5595 21.6596C34.269 22.1655 33.8508 22.5863 33.3467 22.88L13.3467 34.5467C12.8401 34.8423 12.2645 34.999 11.678 35.001C11.0915 35.003 10.5149 34.8502 10.0063 34.558C9.49772 34.2659 9.07524 33.8447 8.78151 33.337C8.48778 32.8294 8.3332 32.2532 8.33337 31.6667V8.33334Z" stroke="#C3C3C3" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </button> 

        <button
            class="bg-[#2C2C2C]/80 p-[20px] rounded-[24px] hover:bg-[#2C2C2C]/50 backdrop-blur-md transition-colors duration-300 cursor-pointer"
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
            class="bg-[#2C2C2C]/80 p-[20px] rounded-[24px] hover:bg-[#2C2C2C]/50 backdrop-blur-md transition-colors duration-300 cursor-pointer"
            aria-label="lists"
            on:click={() => router.navigate("lists")}
        >
            <svg
                width="40"
                height="40"
                viewBox="0 0 40 40"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                <path
                    d="M26.6667 10.0001L33.3333 33.3334M20 10.0001V33.3334M13.3333 13.3334V33.3334M6.66667 6.66675V33.3334"
                    stroke="#C3C3C3"
                    stroke-width="3"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
            </svg>
        </button>

        <button
            class="bg-[#2C2C2C]/80 p-[20px] rounded-[24px] hover:bg-[#2C2C2C]/50 backdrop-blur-md transition-colors duration-300 cursor-pointer"
            aria-label="settings"
            on:click={() => dispatch("openSettings")}
        >
            <svg
                width="40"
                height="40"
                viewBox="0 0 40 40"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                <path
                    d="M20 33.3333C23.5362 33.3333 26.9276 31.9285 29.4281 29.428C31.9286 26.9275 33.3333 23.5361 33.3333 19.9999C33.3333 16.4637 31.9286 13.0723 29.4281 10.5718C26.9276 8.07134 23.5362 6.66659 20 6.66659M20 33.3333C16.4638 33.3333 13.0724 31.9285 10.5719 29.428C8.07142 26.9275 6.66666 23.5361 6.66666 19.9999M20 33.3333V36.6666M20 6.66659C16.4638 6.66659 13.0724 8.07134 10.5719 10.5718C8.07142 13.0723 6.66666 16.4637 6.66666 19.9999M20 6.66659V3.33325M6.66666 19.9999H3.33333M23.3333 19.9999C23.3333 20.884 22.9821 21.7318 22.357 22.3569C21.7319 22.9821 20.884 23.3333 20 23.3333C19.1159 23.3333 18.2681 22.9821 17.643 22.3569C17.0179 21.7318 16.6667 20.884 16.6667 19.9999C16.6667 19.1159 17.0179 18.268 17.643 17.6429C18.2681 17.0178 19.1159 16.6666 20 16.6666C20.884 16.6666 21.7319 17.0178 22.357 17.6429C22.9821 18.268 23.3333 19.1159 23.3333 19.9999ZM23.3333 19.9999H36.6667M28.3333 34.4333L26.6667 31.5499M18.3333 17.1166L11.6667 5.56659M34.4333 28.3333L31.55 26.6666M5.56666 11.6666L8.45 13.3333M34.4333 11.6666L31.55 13.3333M5.56666 28.3333L8.45 26.6666M28.3333 5.56659L26.6667 8.44992M18.3333 22.8833L11.6667 34.4333"
                    stroke="#C3C3C3"
                    stroke-width="3"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
            </svg>
        </button>
    </div>
</div>
