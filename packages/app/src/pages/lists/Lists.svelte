<script lang="ts">
    import { onMount } from "svelte";
    import { fade } from "svelte/transition";
    import SearchBar from "../../components/home/SearchBar.svelte";
    import LoadingSpinner from "../../components/common/LoadingSpinner.svelte";
    import AmbientBackdrop from "../../components/common/AmbientBackdrop.svelte";
    import ListsEmpty from "./components/ListsEmpty.svelte";
    import ListTabs from "./components/ListTabs.svelte";
    import ListFeature from "./components/ListFeature.svelte";
    import ListItemGrid from "./components/ListItemGrid.svelte";
    import { loadLists } from "./dataLoader";
    import { loaded, lists, selectedItem, selectedListId } from "./listsState";

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
        const handleRefresh = () => void refreshLists();
        window.addEventListener(HOME_REFRESH_EVENT, handleRefresh);
        return () => window.removeEventListener(HOME_REFRESH_EVENT, handleRefresh);
    });
</script>

<div class="relative flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-canvas">
    <AmbientBackdrop src={$selectedItem?.background || $selectedItem?.poster} />

    <SearchBar absolute={false} />

    {#if $loaded}
        {#if $lists.length === 0}
            <ListsEmpty />
        {:else}
            <div
                class="relative z-10 mx-auto flex min-h-0 w-full max-w-[1680px] flex-1 flex-col gap-[clamp(16px,1.6vw,26px)] px-[var(--raffi-page-gutter)]"
                in:fade={{ duration: 300 }}
            >
                <ListTabs />
                <ListFeature />
                <div class="no-scrollbar -mx-3 min-h-0 flex-1 overflow-y-auto px-3 pt-2">
                    {#if $selectedListId}
                        <ListItemGrid listId={$selectedListId} />
                    {/if}
                </div>
            </div>
        {/if}
    {:else}
        <div class="flex h-full w-full items-center justify-center" out:fade={{ duration: 200 }}>
            <LoadingSpinner size="60px" />
        </div>
    {/if}
</div>
