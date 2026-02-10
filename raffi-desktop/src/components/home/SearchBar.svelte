<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";
    import { Search, Link, Blocks, Library, Settings } from "lucide-svelte";
    import {
        searchAddonTitlesSplit,
        searchTitlesSplit,
        type SearchTitleResult,
        type SplitSearchResults,
    } from "../../lib/library/library";
    import { getCachedMetaData } from "../../lib/library/metaCache";
    import { router } from "../../lib/stores/router";
    import Skeleton from "../common/Skeleton.svelte";
    import { fade } from "svelte/transition";
	import TitleContextMenu from "./context_menus/TitleContextMenu.svelte";
	import ListsPopup from "../meta/modals/ListsPopup.svelte";
	import PlayModal from "./modals/PlayModal.svelte";
	import { trackEvent } from "../../lib/analytics";
	import { currentUser, updateStatus } from "../../lib/stores/authStore";
    import {
        HOME_SEARCH_BAR_POSITION_AUTO,
        HOME_SEARCH_BAR_POSITION_BOTTOM,
        HOME_SEARCH_BAR_POSITION_CHANGED_EVENT,
        HOME_SEARCH_BAR_POSITION_HEADER,
        type HomeSearchBarPosition,
        getStoredHomeSearchBarPosition,
    } from "../../lib/home/searchBarSettings";


    const dispatch = createEventDispatcher();

    let searchQuery = "";
    let searchResults: SplitSearchResults = { movies: [], series: [] };
	let searchTimeout: any;
	let showSearchResults = false;
	let loading = false;
	let lastSearchQueryLength = 0;
	let lastSearchResultsCount = 0;
	let commandHint = "";
	let updateProgressPercent = 0;
    let totalSearchResults = 0;
    let searchBarPositionPreference: HomeSearchBarPosition =
        HOME_SEARCH_BAR_POSITION_AUTO;
    let autoDockToBottom = false;
    let searchDockBottom = false;


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
    let scrollContainer: HTMLElement | null = null;
    let portalSearchDock = false;
    let homeOverlayMode = false;
    let searchDockStyle = "";
    const HEADER_SCROLL_ENTER_THRESHOLD = 140;
    const HEADER_SCROLL_LEAVE_THRESHOLD = 96;

    const portalToBody = (node: HTMLElement, enabled: boolean) => {
        if (typeof document === "undefined") {
            return { update() {}, destroy() {} };
        }

        const placeholder = document.createComment("search-dock-portal");
        let isPortaled = false;

        const mountToBody = () => {
            if (isPortaled) return;
            const parent = node.parentNode;
            if (!parent) return;
            parent.insertBefore(placeholder, node);
            document.body.appendChild(node);
            isPortaled = true;
        };

        const restoreToParent = () => {
            if (!isPortaled) return;
            const parent = placeholder.parentNode;
            if (!parent) return;
            parent.insertBefore(node, placeholder);
            parent.removeChild(placeholder);
            isPortaled = false;
        };

        if (enabled) mountToBody();

        return {
            update(next: boolean) {
                if (next) mountToBody();
                else restoreToParent();
            },
            destroy() {
                restoreToParent();
            },
        };
    };

    function updateAutoDockPosition() {
        if (searchBarPositionPreference !== HOME_SEARCH_BAR_POSITION_AUTO) {
            autoDockToBottom = false;
            return;
        }

        if ($router.page !== "home") {
            autoDockToBottom = false;
            return;
        }

        const container =
            scrollContainer ??
            (document.querySelector(
                "[data-scroll-container]",
            ) as HTMLElement | null);

        const scrollTop = container ? container.scrollTop : window.scrollY;
        const enterThreshold = HEADER_SCROLL_ENTER_THRESHOLD;
        const leaveThreshold = HEADER_SCROLL_LEAVE_THRESHOLD;

        if (autoDockToBottom) {
            autoDockToBottom = scrollTop > leaveThreshold;
        } else {
            autoDockToBottom = scrollTop > enterThreshold;
        }
    }

    function refreshSearchBarPositionPreference() {
        searchBarPositionPreference = getStoredHomeSearchBarPosition();
        updateAutoDockPosition();
    }

    const handleScrollOrResize = () => {
        updateAutoDockPosition();
    };

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

    function mergeSearchRows(
        primary: SearchTitleResult[],
        secondary: SearchTitleResult[],
    ) {
        const merged = new Map<string, SearchTitleResult>();
        for (const item of primary) {
            if (!merged.has(item.id)) merged.set(item.id, item);
        }
        for (const item of secondary) {
            if (!merged.has(item.id)) merged.set(item.id, item);
        }
        return Array.from(merged.values());
    }

	const handleCommandEnter = () => {
		const trimmed = searchQuery.trim();
		if (!trimmed.startsWith("/")) return false;
		const handled = runCommand(trimmed);
		searchQuery = "";
		searchResults = { movies: [], series: [] };
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
			searchResults = { movies: [], series: [] };
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
				const nextResults = await searchTitlesSplit(trimmed);
				if (searchQuery.trim() !== trimmed) return;
				searchResults = nextResults;
				const totalResults =
					nextResults.movies.length + nextResults.series.length;
				lastSearchQueryLength = queryLength;
				lastSearchResultsCount = totalResults;
				trackEvent("search_performed", {
					query_length: queryLength,
					results_count: totalResults,
				});

                // Non-blocking addon search enrichment.
                void searchAddonTitlesSplit(trimmed)
                    .then((addonResults) => {
                        if (searchQuery.trim() !== trimmed) return;
                        if (
                            addonResults.movies.length === 0 &&
                            addonResults.series.length === 0
                        ) {
                            return;
                        }
                        const merged: SplitSearchResults = {
                            movies: mergeSearchRows(
                                searchResults.movies,
                                addonResults.movies,
                            ),
                            series: mergeSearchRows(
                                searchResults.series,
                                addonResults.series,
                            ),
                        };
                        if (
                            merged.movies.length === searchResults.movies.length &&
                            merged.series.length === searchResults.series.length
                        ) {
                            return;
                        }
                        searchResults = merged;
                        lastSearchResultsCount =
                            merged.movies.length + merged.series.length;
                    })
                    .catch((error) => {
                        console.error("Addon search enrichment failed", error);
                    });
			} catch (e) {
				console.error("Search failed", e);
				if (searchQuery.trim() !== trimmed) return;
				searchResults = { movies: [], series: [] };
				lastSearchQueryLength = queryLength;
				lastSearchResultsCount = 0;
				trackEvent("search_failed", {
					query_length: queryLength,
					error_name: e instanceof Error ? e.name : "unknown",
				});
			} finally {
				if (searchQuery.trim() === trimmed) {
					loading = false;
				}
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

	$: {
		const raw = $updateStatus.downloaded
			? 100
			: typeof $updateStatus.downloadProgress === "number"
				? $updateStatus.downloadProgress
				: 8;
		updateProgressPercent = Math.max(8, Math.min(100, Math.round(raw)));
	}

	function openPlayModal() {
		trackEvent("play_modal_opened", { source: "search_bar" });
		showPlayModal = true;
	}

	function handleContextMenu(
		e: MouseEvent,
		result: SearchTitleResult,
		index: number,
	) {
		contextMenuX = e.clientX;
		contextMenuY = e.clientY;
		selectedImdbId = result.imdbId;
		selectedType = result.type;
		selectedTitle = result.name;
		showContextMenu = true;
		trackEvent("search_result_context_menu", {
			query_length: lastSearchQueryLength,
			results_count: lastSearchResultsCount,
			result_index: index,
			content_type: result.type,
		});
	}

	$: totalSearchResults = searchResults.movies.length + searchResults.series.length;
    $: searchDockBottom =
        searchBarPositionPreference === HOME_SEARCH_BAR_POSITION_BOTTOM ||
        (searchBarPositionPreference === HOME_SEARCH_BAR_POSITION_AUTO &&
            $router.page === "home" &&
            autoDockToBottom);
    $: homeOverlayMode = absolute && $router.page === "home";
    $: portalSearchDock = homeOverlayMode;
    $: searchDockStyle = homeOverlayMode
        ? `top: ${searchDockBottom ? "calc(100vh - 24px - 86px)" : "50px"};`
        : "";

    $: if (searchBarPositionPreference === HOME_SEARCH_BAR_POSITION_AUTO) {
        $router.page;
        updateAutoDockPosition();
    }

    onMount(() => {
        refreshSearchBarPositionPreference();
        scrollContainer = document.querySelector(
            "[data-scroll-container]",
        ) as HTMLElement | null;
        (scrollContainer ?? window).addEventListener(
            "scroll",
            handleScrollOrResize,
            { passive: true } as AddEventListenerOptions,
        );
        window.addEventListener("resize", handleScrollOrResize);
        window.addEventListener(
            HOME_SEARCH_BAR_POSITION_CHANGED_EVENT,
            refreshSearchBarPositionPreference,
        );

        return () => {
            (scrollContainer ?? window).removeEventListener(
                "scroll",
                handleScrollOrResize,
            );
            window.removeEventListener("resize", handleScrollOrResize);
            window.removeEventListener(
                HOME_SEARCH_BAR_POSITION_CHANGED_EVENT,
                refreshSearchBarPositionPreference,
            );
        };
    });

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

    <div
        use:portalToBody={portalSearchDock}
        style={searchDockStyle}
        class={`flex flex-col left-1/2 -translate-x-1/2 ${
            homeOverlayMode
                ? "fixed z-[140] transition-[top,filter] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
                : "absolute"
        }`}
    >
        {#if searchDockBottom}
            <div
                class="pointer-events-none absolute -inset-x-6 -inset-y-4 -z-10 rounded-[48px] bg-white/[0.09] blur-2xl opacity-35"
            ></div>
        {/if}
        <div
            class={`flex flex-row gap-0 rounded-full overflow-clip w-[680px] max-w-[62vw] backdrop-blur-md z-20 transition-shadow duration-300 ${
                searchDockBottom
                    ? "shadow-[0_18px_54px_rgba(0,0,0,0.6)] ring-1 ring-white/12"
                    : ""
            }`}
        >
            <div class="p-[20px] bg-[#181818]/50">
                <Search size={40} strokeWidth={2} color="#C3C3C3" />
            </div>

            <input
                type="text"
                placeholder="search for anything"
                class="bg-[#000000]/50 text-[#D4D4D4] text-center py-[20px] px-[40px] w-full text-[28px] font-poppins font-normal outline-none focus:outline-none focus:ring-0"
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
                class={`absolute left-0 w-full bg-[#181818]/90 backdrop-blur-xl rounded-[24px] p-4 text-white/70 text-sm z-100 ${
                    searchDockBottom ? "bottom-[90px]" : "top-[90px]"
                }`}
                transition:fade={{ duration: 200 }}
            >
                {commandHint}
            </div>
        {:else if showSearchResults && (totalSearchResults > 0 || loading)}
            <div
                class={`absolute left-1/2 -translate-x-1/2 w-[780px] max-w-[72vw] bg-[#181818]/90 backdrop-blur-xl rounded-[24px] p-4 z-100 ${
                    searchDockBottom ? "bottom-[90px]" : "top-[90px]"
                }`}
                transition:fade={{ duration: 200 }}
            >
                {#if loading}
                    <div class="grid grid-cols-2 gap-4">
                        {#each ["Movies", "Series"] as label}
                            <div class="rounded-2xl bg-white/[0.04] p-3">
                                <p
                                    class="text-white/70 text-sm font-semibold leading-normal mb-3"
                                >
                                    {label}
                                </p>
                                <div class="space-y-2">
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
                                                <Skeleton width="170px" height="20px" />
                                                <Skeleton width="90px" height="14px" />
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        {/each}
                    </div>
                {:else}
                    <div class="grid grid-cols-2 gap-4">
                        <div class="rounded-2xl bg-white/[0.04] p-3">
                            <p
                                class="text-white/70 text-sm font-semibold leading-normal mb-3"
                            >
                                Movies
                            </p>
                            <div class="space-y-1 max-h-[360px] overflow-y-auto">
                                {#if searchResults.movies.length === 0}
                                    <p class="text-white/45 text-sm px-2 py-3">
                                        No movie results.
                                    </p>
                                {:else}
                                    {#each searchResults.movies as result, index}
                                        <button
                                            class="w-full flex flex-row gap-4 items-center p-2 hover:bg-white/10 rounded-xl transition-colors cursor-pointer text-left"
                                            onclick={() =>
                                                navigateToMeta(
                                                    result.imdbId,
                                                    result.type,
                                                    result.name,
                                                    index,
                                                )}
                                            oncontextmenu={(e) => {
                                                e.preventDefault();
                                                handleContextMenu(
                                                    e,
                                                    result,
                                                    index,
                                                );
                                            }}
                                        >
                                            <img
                                                src={result.poster || ""}
                                                alt={result.name}
                                                class="w-[40px] h-[60px] object-cover rounded-md bg-black/50"
                                            />
                                            <div class="flex flex-col min-w-0">
                                                <span
                                                    class="text-white font-poppins font-medium text-lg line-clamp-1"
                                                    >{result.name}</span
                                                >
                                                <span class="text-white/50 font-poppins text-sm line-clamp-1"
                                                    >{result.year || result.releaseInfo || ""}</span
                                                >
                                            </div>
                                        </button>
                                    {/each}
                                {/if}
                            </div>
                        </div>

                        <div class="rounded-2xl bg-white/[0.04] p-3">
                            <p
                                class="text-white/70 text-sm font-semibold leading-normal mb-3"
                            >
                                Series
                            </p>
                            <div class="space-y-1 max-h-[360px] overflow-y-auto">
                                {#if searchResults.series.length === 0}
                                    <p class="text-white/45 text-sm px-2 py-3">
                                        No series results.
                                    </p>
                                {:else}
                                    {#each searchResults.series as result, index}
                                        <button
                                            class="w-full flex flex-row gap-4 items-center p-2 hover:bg-white/10 rounded-xl transition-colors cursor-pointer text-left"
                                            onclick={() =>
                                                navigateToMeta(
                                                    result.imdbId,
                                                    result.type,
                                                    result.name,
                                                    index + searchResults.movies.length,
                                                )}
                                            oncontextmenu={(e) => {
                                                e.preventDefault();
                                                handleContextMenu(
                                                    e,
                                                    result,
                                                    index + searchResults.movies.length,
                                                );
                                            }}
                                        >
                                            <img
                                                src={result.poster || ""}
                                                alt={result.name}
                                                class="w-[40px] h-[60px] object-cover rounded-md bg-black/50"
                                            />
                                            <div class="flex flex-col min-w-0">
                                                <span
                                                    class="text-white font-poppins font-medium text-lg line-clamp-1"
                                                    >{result.name}</span
                                                >
                                                <span class="text-white/50 font-poppins text-sm line-clamp-1"
                                                    >{result.year || result.releaseInfo || ""}</span
                                                >
                                            </div>
                                        </button>
                                    {/each}
                                {/if}
                            </div>
                        </div>
                    </div>
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

    <div class="flex flex-row items-start gap-[10px]">
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

        <div class="flex flex-col items-center">
            <button
                class={`group relative bg-[#2C2C2C]/80 rounded-[24px] hover:bg-[#2C2C2C]/50 backdrop-blur-md transition-colors duration-300 cursor-pointer ${$currentUser ? 'p-0 overflow-hidden w-[80px] h-[80px]' : 'p-[20px]'}`}
                aria-label="settings"
                onclick={openSettings}
            >
                {#if $currentUser}
                    <div class="w-full h-full bg-white/10 group-hover:bg-black/35 transition-colors duration-300 flex items-center justify-center">
                        {#if $currentUser.avatar}
                            <img
                                src={$currentUser.avatar}
                                alt="Profile"
                                class="w-full h-full object-cover"
                                loading="lazy"
                            />
                            <span class="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></span>
                        {:else}
                            <span class="text-white text-2xl font-semibold uppercase">
                                {($currentUser.name || $currentUser.email || "?").slice(0, 1)}
                            </span>
                        {/if}
                    </div>
                {:else}
                    <Settings size={40} strokeWidth={2} color="#C3C3C3" />
                {/if}
            </button>

            {#if $updateStatus.available}
                <div class="mt-2 h-[3px] w-[54px] rounded-full bg-white/25 overflow-hidden">
                    <div
                        class="h-full bg-white transition-[width] duration-300"
                        style={`width: ${updateProgressPercent}%`}
                    ></div>
                </div>
            {/if}
        </div>
    </div>
</div>
