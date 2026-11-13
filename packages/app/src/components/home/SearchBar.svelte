<script lang="ts">
    import { onMount } from "svelte";
    import { Search, Mic } from "@lucide/svelte";
    import {
        searchAddonTitlesSplit,
        searchTitlesSplit,
        type SearchTitleResult,
        type SplitSearchResults,
    } from "../../lib/library/library";
    import { getCachedMetaData } from "../../lib/library/metaCache";
    import { router } from "../../lib/stores/router";
    import { isTvPlatform } from "../../lib/shell/platform";
    import { listenForSpeech } from "../../lib/android/voice";
    import { channelQuery } from "../../lib/live/library";
    import { fade } from "svelte/transition";
	import TitleContextMenu from "./context_menus/TitleContextMenu.svelte";
	import ListsPopup from "../meta/modals/ListsPopup.svelte";
	import PlayModal from "./modals/PlayModal.svelte";
	import HeaderActions from "./header/HeaderActions.svelte";
	import SearchResults from "./header/SearchResults.svelte";
    import {
        HOME_SEARCH_BAR_POSITION_AUTO,
        HOME_SEARCH_BAR_POSITION_BOTTOM,
        HOME_SEARCH_BAR_POSITION_CHANGED_EVENT,
        type HomeSearchBarPosition,
        getStoredHomeSearchBarPosition,
    } from "../../lib/home/searchBarSettings";


    export let onOpenAddons: () => void = () => {};
    export let onOpenSettings: () => void = () => {};

    let searchQuery = "";
    let searchResults: SplitSearchResults = { movies: [], series: [] };
	let searchTimeout: any;
	let searchArea: HTMLDivElement | null = null;
	let showSearchResults = false;
	let loading = false;
	let commandHint = "";
    let totalSearchResults = 0;
    let searchBarPositionPreference: HomeSearchBarPosition =
        HOME_SEARCH_BAR_POSITION_AUTO;
    let autoDockToBottom = false;
    let searchDockBottom = false;
    let portraitLayout = false;


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
		return handled;
	};

	function handleSearch(e: Event) {
		runSearch((e.target as HTMLInputElement).value);
	}

	async function searchByVoice() {
		const spoken = await listenForSpeech();
		if (!spoken) return;
		if (channelMode) channelQuery.set(spoken);
		else runSearch(spoken);
	}

	function runSearch(query: string) {
		searchQuery = query;
		commandHint = "";

		clearTimeout(searchTimeout);
		if (!query.trim()) {
			searchResults = { movies: [], series: [] };
			showSearchResults = false;
			loading = false;
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
			try {
				const nextResults = await searchTitlesSplit(trimmed);
				if (searchQuery.trim() !== trimmed) return;
				searchResults = nextResults;
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
                    })
                    .catch((error) => {
                        console.error("Addon search enrichment failed", error);
                    });
			} catch (e) {
				console.error("Search failed", e);
				if (searchQuery.trim() !== trimmed) return;
				searchResults = { movies: [], series: [] };
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
            if (!showContextMenu && !showListsPopup && !searchArea?.contains(document.activeElement)) {
                showSearchResults = false;
            }
        }, 200);
    }

	function navigateToMeta(
		imdbId: string,
		type: string,
		name: string,
	) {
		router.navigate("meta", { imdbId, type, name });
	}

	function openPlayModal() {
		showPlayModal = true;
	}

	function handleContextMenu(
		e: MouseEvent,
		result: SearchTitleResult,
	) {
		contextMenuX = e.clientX;
		contextMenuY = e.clientY;
		selectedImdbId = result.imdbId;
		selectedType = result.type;
		selectedTitle = result.name;
		showContextMenu = true;
	}

	const inputClass =
		"bg-[#000000]/50 text-[#D4D4D4] text-center px-[clamp(20px,2vw,40px)] w-full min-w-0 text-[clamp(18px,1.5vw,28px)] font-poppins font-normal outline-none focus:outline-none focus:ring-0 transition-[font-size,padding] duration-300";

	$: channelMode = $router.page === "live";
	$: totalSearchResults = searchResults.movies.length + searchResults.series.length;
    /** On TV the bar stays in the header, where it neither covers the rows nor catches the remote's Down key. */
    $: searchDockBottom =
        !isTvPlatform &&
        (portraitLayout ||
            searchBarPositionPreference === HOME_SEARCH_BAR_POSITION_BOTTOM ||
            (searchBarPositionPreference === HOME_SEARCH_BAR_POSITION_AUTO &&
                $router.page === "home" &&
                autoDockToBottom));
    $: homeOverlayMode = absolute && $router.page === "home";
    $: portalSearchDock = homeOverlayMode || portraitLayout;
    $: if (searchBarPositionPreference === HOME_SEARCH_BAR_POSITION_AUTO) {
        $router.page;
        updateAutoDockPosition();
    }

    onMount(() => {
        const portrait = window.matchMedia("(orientation: portrait)");
        const updatePortrait = () => {
            portraitLayout = portrait.matches;
        };
        updatePortrait();
        portrait.addEventListener("change", updatePortrait);
        refreshSearchBarPositionPreference();
        scrollContainer = document.querySelector(
            "[data-scroll-container]",
        ) as HTMLElement | null;
        updateAutoDockPosition();
        const scrollTarget = scrollContainer ?? window;
        if (!isTvPlatform) {
            scrollTarget.addEventListener("scroll", updateAutoDockPosition, { passive: true });
        }
        window.addEventListener(
            HOME_SEARCH_BAR_POSITION_CHANGED_EVENT,
            refreshSearchBarPositionPreference,
        );

        return () => {
            portrait.removeEventListener("change", updatePortrait);
            scrollTarget.removeEventListener("scroll", updateAutoDockPosition);
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
        : 'relative'} top-0 left-0 w-full p-[clamp(24px,2.7vw,50px)] flex flex-row justify-between items-center z-50"
>
    <button
        class="cursor-pointer hover:opacity-80 transition-opacity"
        onclick={() => {
            router.navigate("home");
            onLogoClick();
        }}
    >
        <img
            src="raffi.svg"
            alt="Raffi Logo"
            class="header-logo h-[clamp(56px,4vw,80px)]"
        />
    </button>

    <div
        use:portalToBody={portalSearchDock}
        data-tv-pinned={homeOverlayMode || portraitLayout ? "" : undefined}
        style={homeOverlayMode || portraitLayout
            ? `top: ${portraitLayout || searchDockBottom
                ? "calc(100dvh - clamp(20px, 3vh, 32px) - clamp(56px, 4vw, 80px))"
                : "clamp(24px, 2.7vw, 50px)"};`
            : ""}
        class={`flex flex-col left-1/2 -translate-x-1/2 ${
            homeOverlayMode || portraitLayout
                ? "fixed z-[140] will-change-[top] transition-[top,filter] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
                : "absolute"
        }`}
    >
        <div bind:this={searchArea}>
            {#if portraitLayout || searchDockBottom}
                <div
                    class="pointer-events-none absolute -inset-x-6 -inset-y-4 -z-10 rounded-[48px] bg-white/[0.09] blur-2xl opacity-35"
                ></div>
            {/if}
            <div
                data-focus-ring
                class={`search-shell flex h-[clamp(56px,4vw,80px)] flex-row gap-0 rounded-full overflow-clip backdrop-blur-md z-20 transition-[width,height,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    portraitLayout
                        ? "w-[calc(100vw-clamp(32px,8vw,72px))] max-w-[720px]"
                        : "w-[clamp(340px,36vw,680px)] max-w-[48vw]"
                } ${
                    portraitLayout || searchDockBottom
                        ? "shadow-[0_18px_54px_rgba(0,0,0,0.6)] ring-1 ring-white/12"
                        : ""
                }`}
            >
                <slot name="leading">
                    <div class="search-icon flex w-[clamp(56px,4vw,80px)] shrink-0 items-center justify-center bg-[#181818]/50">
                        <Search size={40} strokeWidth={2} color="#C3C3C3" />
                    </div>
                </slot>

                {#if channelMode}
                    <input
                        type="text"
                        placeholder="search channels"
                        spellcheck="false"
                        class={inputClass}
                        oninput={(event) => channelQuery.set(event.currentTarget.value)}
                        onkeydown={(event) => event.key === "Escape" && channelQuery.set("")}
                        value={$channelQuery}
                    />
                {:else}
                    <input
                        type="text"
                        placeholder="search for anything"
                        class={inputClass}
                        oninput={handleSearch}
                        onkeydown={handleSearchKeydown}
                        onfocus={() => {
                            if (searchQuery) showSearchResults = true;
                        }}
                        onblur={closeSearch}
                        value={searchQuery}
                    />
                {/if}

                {#if isTvPlatform}
                    <button
                        data-own-focus
                        class="search-icon flex w-[clamp(56px,4vw,80px)] shrink-0 items-center justify-center bg-[#181818]/50 text-[#C3C3C3] transition-colors focus:bg-white focus:text-black"
                        aria-label="Search by voice"
                        onclick={searchByVoice}
                    >
                        <Mic size={36} strokeWidth={2} />
                    </button>
                {/if}
            </div>

            {#if commandHint}
                <div
                    class={`absolute left-0 w-full bg-[#181818]/90 backdrop-blur-xl rounded-[24px] p-4 text-white/70 text-sm z-100 ${
                        portraitLayout || searchDockBottom ? "bottom-[90px]" : "top-[90px]"
                    }`}
                    transition:fade={{ duration: 200 }}
                >
                    {commandHint}
                </div>
            {:else if showSearchResults && (totalSearchResults > 0 || loading)}
                <SearchResults
                    results={searchResults}
                    {loading}
                    above={portraitLayout || searchDockBottom}
                    onOpen={(result) => navigateToMeta(result.imdbId, result.type, result.name)}
                    onContextMenu={handleContextMenu}
                />
            {/if}
        </div>
    </div>

    {#if showContextMenu}
        <TitleContextMenu
            x={contextMenuX}
            y={contextMenuY}
            onClose={() => (showContextMenu = false)}
            onAddToList={handleAddToList}
        />
    {/if}

    {#if showPlayModal}
        <PlayModal onClose={() => showPlayModal = false} />
    {/if}


    <ListsPopup
        bind:visible={showListsPopup}
        imdbId={selectedImdbId}
        type={selectedType}
    />

    <HeaderActions onOpenPlay={openPlayModal} onOpenAddons={onOpenAddons} onOpenSettings={onOpenSettings} />
</div>

<style>
    .header-logo {
        transition: height 300ms cubic-bezier(0.22, 1, 0.36, 1);
    }
    .search-icon :global(svg) {
        width: clamp(24px, 1.7vw, 32px);
        height: clamp(24px, 1.7vw, 32px);
        transition: width 300ms cubic-bezier(0.22, 1, 0.36, 1), height 300ms cubic-bezier(0.22, 1, 0.36, 1);
    }
</style>
