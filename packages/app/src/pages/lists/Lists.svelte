<script lang="ts">
    import { onMount } from "svelte";
    import { fade } from "svelte/transition";
    import SearchBar from "../../components/home/SearchBar.svelte";
    import LoadingSpinner from "../../components/common/LoadingSpinner.svelte";
    import TopGlow from "../../components/common/TopGlow.svelte";

    import ListSidebar from "./components/ListSidebar.svelte";
    import ListPreview from "./components/ListPreview.svelte";
    import ListsEmpty from "./components/ListsEmpty.svelte";
    import ListItemGrid from "./components/ListItemGrid.svelte";

    import { loadLists } from "./dataLoader";
    import { loaded, lists } from "./listsState";

    const HOME_REFRESH_EVENT = "raffi:home-refresh";

    let refreshRequestId = 0;

    async function refreshLists(showLoading = false) {
        const requestId = ++refreshRequestId;
        if (showLoading) loaded.set(false);
        await loadLists();
        if (requestId === refreshRequestId) loaded.set(true);
    }

    onMount(() => {
        void refreshLists(true);

        const handleRefresh = () => {
            void refreshLists();
        };

        window.addEventListener(HOME_REFRESH_EVENT, handleRefresh);

        return () => {
            window.removeEventListener(HOME_REFRESH_EVENT, handleRefresh);
        };
    });
</script>

<div
    class="bg-canvas h-[100dvh] min-h-0 w-full flex flex-col overflow-hidden items-center relative"
>
    <SearchBar
        absolute={false}
    />

    {#if $loaded}
        {#if $lists.length === 0}
            <ListsEmpty />
        {:else}
            <div class="relative z-10 flex-1 min-h-0 w-full px-[var(--raffi-page-gutter)] pb-[clamp(14px,1.3vw,20px)] pt-[clamp(20px,2.6vw,40px)]" in:fade={{ duration: 300 }}>
                <div class="lists-layout mx-auto grid h-full min-h-0 w-full max-w-[1680px] gap-[clamp(14px,1.3vw,20px)]">
                    <ListSidebar>
                        <div slot="grid" let:listId>
                            <ListItemGrid {listId} />
                        </div>
                    </ListSidebar>

                    <ListPreview />
                </div>
            </div>

            <TopGlow />
        {/if}
    {:else}
        <div
            class="w-full h-full flex items-center justify-center"
            out:fade={{ duration: 200 }}
        >
            <LoadingSpinner size="60px" />
        </div>
    {/if}
</div>

<style>
    .lists-layout {
        grid-template-columns: minmax(0, 1.12fr) minmax(380px, 0.88fr);
    }

    @media (max-width: 900px), (orientation: portrait) {
        .lists-layout {
            grid-template-columns: minmax(0, 1fr);
        }

        .lists-layout :global(.list-preview) {
            display: none;
        }
    }
</style>
