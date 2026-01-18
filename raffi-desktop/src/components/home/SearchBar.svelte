<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { Search, Link, Blocks, Library, Settings } from "lucide-svelte";
    import { searchTitles } from "../../lib/library/library";
    import { getCachedMetaData } from "../../lib/library/metaCache";
    import { router } from "../../lib/stores/router";
    import Skeleton from "../common/Skeleton.svelte";
    import { fade } from "svelte/transition";
	import TitleContextMenu from "./context_menus/TitleContextMenu.svelte";
	import ListsPopup from "../meta/modals/ListsPopup.svelte";
	import PlayModal from "./modals/PlayModal.svelte";
	import { trackEvent } from "../../lib/analytics";
	import { updateStatus } from "../../lib/stores/authStore";


    const dispatch = createEventDispatcher();

    let searchQuery = "";
    let searchResults: any[] = [];
	let searchTimeout: any;
	let showSearchResults = false;
	let loading = false;
	let lastSearchQueryLength = 0;
	let lastSearchResultsCount = 0;
	let commandHint = "";


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

	const runCommand = (rawCommand: string) => {
		const normalized = rawCommand.trim().toLowerCase();
		if (!normalized) return false;

		switch (normalized) {
			case "/test_update":
			case "/test-update":
				window.dispatchEvent(new CustomEvent("raffi-test-update"));
				commandHint = "Triggered test update.";
				return true;
			default:
				commandHint = `Unknown command: ${normalized}`;
				return false;
		}
	};

	const handleCommandEnter = () => {
		const trimmed = searchQuery.trim();
		if (!trimmed.startsWith("/")) return false;
		const handled = runCommand(trimmed);
		searchQuery = "";
		searchResults = [];
		showSearchResults = false;
		loading = false;
		lastSearchQueryLength = 0;
		lastSearchResultsCount = 0;
		return handled;
	};

	function handleSearch(e: Event) {
		const query = (e.target as HTMLInputElement).value;
		searchQuery = query;
		commandHint = "";

		clearTimeout(searchTimeout);
		if (!query.trim()) {
			searchResults = [];
			showSearchResults = false;
			loading = false;
			lastSearchQueryLength = 0;
			lastSearchResultsCount = 0;
			return;
		}

		if (query.trim().startsWith("/")) {
			showSearchResults = false;
			loading = false;
			return;
		}

		loading = true;
		showSearchResults = true;

		searchTimeout = setTimeout(async () => {
			const trimmed = query.trim();
			const queryLength = trimmed.length;
			try {
				searchResults = await searchTitles(query);
				lastSearchQueryLength = queryLength;
				lastSearchResultsCount = searchResults.length;
				trackEvent("search_performed", {
					query_length: queryLength,
					results_count: searchResults.length,
				});
			} catch (e) {
				console.error("Search failed", e);
				searchResults = [];
				lastSearchQueryLength = queryLength;
				lastSearchResultsCount = 0;
				trackEvent("search_failed", {
					query_length: queryLength,
					error_name: e instanceof Error ? e.name : "unknown",
				});
			} finally {
				loading = false;
			}
		}, 500);
	}

	const handleSearchKeydown = (event: KeyboardEvent) => {
		if (event.key !== "Enter") return;
		if (searchQuery.trim().startsWith("/")) {
			event.preventDefault();
			handleCommandEnter();
		}
	};



    function closeSearch() {
        // Delay closing to allow clicks on results or context menu
        setTimeout(() => {
            // Only close if we're not interacting with context menu or popup
            if (!showContextMenu && !showListsPopup) {
                showSearchResults = false;
            }
        }, 200);
    }

	function navigateToMeta(
		imdbId: string,
		type: string,
		name: string,
		index: number,
	) {
		trackEvent("search_result_opened", {
			query_length: lastSearchQueryLength,
			results_count: lastSearchResultsCount,
			result_index: index,
			content_type: type,
		});
		router.navigate("meta", { imdbId, type, name });
	}

	function openAddons() {
		trackEvent("addons_opened", { source: "search_bar" });
		dispatch("openAddons");
	}

	function openLists() {
		trackEvent("lists_opened", { source: "search_bar" });
		router.navigate("lists");
	}

	function openSettings() {
		trackEvent("settings_opened", { source: "search_bar" });
		dispatch("openSettings");
	}

	function openPlayModal() {
		trackEvent("play_modal_opened", { source: "search_bar" });
		showPlayModal = true;
	}

	function handleContextMenu(
		e: MouseEvent,
		imdbId: string,
		type: string,
		title: string,
		index: number,
	) {
		contextMenuX = e.clientX;
		contextMenuY = e.clientY;
		selectedImdbId = imdbId;
		selectedType = type;
		selectedTitle = title;
		showContextMenu = true;
		trackEvent("search_result_context_menu", {
			query_length: lastSearchQueryLength,
			results_count: lastSearchResultsCount,
			result_index: index,
			content_type: type,
		});
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
        onclick={() => {
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
                <Search size={40} strokeWidth={2} color="#C3C3C3" />
            </div>

            <input
                type="text"
                placeholder="search for anything"
                class="bg-[#000000]/50 text-[#D4D4D4] text-center py-[20px] px-[70px] w-fit text-[28px] font-poppins font-normal outline-none focus:outline-none focus:ring-0"
                oninput={handleSearch}
                onkeydown={handleSearchKeydown}
                onfocus={() => {
                    if (searchQuery) showSearchResults = true;
                }}
                onblur={closeSearch}
                value={searchQuery}
            />

        </div>

        {#if commandHint}
            <div
                class="absolute top-[90px] left-0 w-full bg-[#181818]/90 backdrop-blur-xl rounded-[24px] p-4 text-white/70 text-sm z-100"
                transition:fade={{ duration: 200 }}
            >
                {commandHint}
            </div>
        {:else if showSearchResults && (searchResults.length > 0 || loading)}
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
                    {#each searchResults as result, index}
                        <button
                            class="flex flex-row gap-4 items-center p-2 hover:bg-white/10 rounded-xl transition-colors cursor-pointer text-left"
                            onclick={() =>
                                navigateToMeta(
                                    result["#IMDB_ID"],
                                    "movie",
                                    result["#TITLE"],
                                    index,
                                )}
                            oncontextmenu={(e) => {
                                e.preventDefault();
                                handleContextMenu(
                                    e,
                                    result["#IMDB_ID"],
                                    "movie", // Assuming movie for now, search results might not have type
                                    result["#TITLE"],
                                    index,
                                );
                            }}
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
            onclose={() => (showContextMenu = false)}
            onaddToList={handleAddToList}
        />
    {/if}

    {#if showPlayModal}
        <PlayModal onClose={() => showPlayModal = false} />
    {/if}


    <ListsPopup
        bind:visible={showListsPopup}
        imdbId={selectedImdbId}
        type={selectedType}
        onclose={() => (showListsPopup = false)}
    />

    <div class="flex flex-row gap-[10px]">
        <button
            class="bg-[#2C2C2C]/80 p-[20px] rounded-[24px] hover:bg-[#2C2C2C]/50 backdrop-blur-md transition-colors duration-300 cursor-pointer"
            aria-label="addons"
            onclick={openPlayModal}
        >
            <Link size={40} strokeWidth={2} color="#C3C3C3" />
        </button>

        <button
            class="bg-[#2C2C2C]/80 p-[20px] rounded-[24px] hover:bg-[#2C2C2C]/50 backdrop-blur-md transition-colors duration-300 cursor-pointer"
            aria-label="addons"
            onclick={openAddons}
        >
            <Blocks size={40} strokeWidth={2} color="#C3C3C3" />
        </button>

        <button
            class="bg-[#2C2C2C]/80 p-[20px] rounded-[24px] hover:bg-[#2C2C2C]/50 backdrop-blur-md transition-colors duration-300 cursor-pointer"
            aria-label="lists"
            onclick={openLists}
        >
            <Library size={40} strokeWidth={2} color="#C3C3C3" />
        </button>

        <button
            class="relative bg-[#2C2C2C]/80 p-[20px] rounded-[24px] hover:bg-[#2C2C2C]/50 backdrop-blur-md transition-colors duration-300 cursor-pointer"
            aria-label="settings"
            onclick={openSettings}
        >
            <Settings size={40} strokeWidth={2} color="#C3C3C3" />
            {#if $updateStatus.available}
                <span class="absolute top-3 right-3 flex h-2.5 w-2.5">
                    <span class="absolute inline-flex h-full w-full rounded-full bg-[#FF3B30]/60 animate-ping"></span>
                    <span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#FF3B30]"></span>
                </span>
            {/if}
        </button>
    </div>
</div>
