<script lang="ts">
    import { onMount } from "svelte";
    import { fade } from "svelte/transition";
    import SearchBar from "../components/home/SearchBar.svelte";
    import {
        deleteList,
        getListItems,
        getLists,
        getListsWithItems,
        removeFromList,
        updateList,
        updateListItemPosition,
        updateListItemPoster,
        type List,
    } from "../lib/db/db";
    import { getCachedMetaData } from "../lib/library/metaCache";
    import { router } from "../lib/stores/router";
    import ExpandingButton from "../components/ExpandingButton.svelte";
    import AddonsModal from "../components/AddonsModal.svelte";
    import LoadingSpinner from "../components/common/LoadingSpinner.svelte";

    let loaded = false;
    let lists: List[] = [];
    let listItemsMap: Record<string, any[]> = {};
    let selectedItem: any = null;
    let selectedListId: string | null = null;

    let playerIframe: HTMLIFrameElement;
    let isPaused = false;
    let isMuted = true;
    let showAddonsModal = false;

    let editingListId: string | null = null;
    let editingName = "";

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

    onMount(async () => {
        await loadLists();
        loaded = true;
    });

    async function loadLists() {
        try {
            const listsWithItems = await getListsWithItems();
            lists = listsWithItems as List[];

            // Load metadata for all items
            for (const list of listsWithItems) {
                await loadListItems(list.list_id, list.list_items);
            }

            if (!selectedItem && lists.length > 0) {
                const firstListId = lists[0].list_id;
                if (
                    listItemsMap[firstListId] &&
                    listItemsMap[firstListId].length > 0
                ) {
                    selectItem(listItemsMap[firstListId][0], firstListId);
                }
            }
        } catch (e) {
            console.error("Failed to load lists", e);
        }
    }

    async function loadListItems(listId: string, items?: any[]) {
        try {
            if (!items) {
                items = await getListItems(listId);
            }

            const metaPromises = items.map(async (item) => {
                if (item.poster) {
                    return {
                        poster: item.poster,
                        imdb_id: item.imdb_id,
                        type: item.type,
                        list_id: listId,
                        db_item: item,
                        _partial: true,
                    };
                }

                try {
                    const data = await getCachedMetaData(
                        item.imdb_id,
                        item.type,
                    );
                    if (data && data.meta) {
                        if (!item.poster && data.meta.poster) {
                            try {
                                await updateListItemPoster(
                                    listId,
                                    item.imdb_id,
                                    data.meta.poster,
                                );

                                item.poster = data.meta.poster;
                            } catch (e) {
                                console.error("Failed to backfill poster", e);
                            }
                        }
                        return { ...data.meta, list_id: listId, db_item: item };
                    }
                } catch (e) {
                    console.error(`Failed to load meta for ${item.imdb_id}`, e);
                }
                return null;
            });

            const metas = await Promise.all(metaPromises);

            listItemsMap[listId] = metas
                .filter((m): m is NonNullable<typeof m> => !!m)
                .map((m) => ({
                    ...m,
                    poster: m.db_item.poster || m.poster,
                    position: m.db_item.position,
                }))
                .sort((a, b) => a.position - b.position);
        } catch (e) {
            console.error("Failed to load list items", e);
        }
    }

    async function handleDeleteList(listId: string) {
        if (!confirm("Are you sure you want to delete this list?")) return;
        try {
            await deleteList(listId);
            await loadLists();
            if (selectedListId === listId) {
                selectedItem = null;
                selectedListId = null;
            }
        } catch (e) {
            console.error("Failed to delete list", e);
        }
    }

    async function handleRemoveFromList() {
        if (!selectedItem || !selectedListId) return;
        if (!confirm("Remove this item from the list?")) return;

        try {
            await removeFromList(selectedListId, selectedItem.imdb_id);
            await loadListItems(selectedListId);

            const currentListItems = listItemsMap[selectedListId];
            if (currentListItems.length > 0) {
                selectItem(currentListItems[0], selectedListId);
            } else {
                selectedItem = null;
            }
        } catch (e) {
            console.error("Failed to remove item", e);
        }
    }

    let loadingItem: string | null = null;

    async function selectItem(item: any, listId: string) {
        if (loadingItem === item.imdb_id) return; // Prevent double clicks

        selectedListId = listId;
        isPaused = false;
        isMuted = true;

        if (item._partial) {
            loadingItem = item.imdb_id;
            // Fetch full meta
            try {
                const data = await getCachedMetaData(item.imdb_id, item.type);
                if (data && data.meta) {
                    selectedItem = {
                        ...data.meta,
                        list_id: listId,
                        db_item: item.db_item,
                    };
                    // Update the item in the map too so we don't fetch again?
                    const items = listItemsMap[listId];
                    const idx = items.findIndex(
                        (i) => i.imdb_id === item.imdb_id,
                    );
                    if (idx !== -1) {
                        items[idx] = {
                            ...selectedItem,
                            poster: item.poster,
                            position: item.position,
                        };
                    }
                }
            } catch (e) {
                console.error("Failed to fetch full meta for selected item", e);
                selectedItem = item; // Fallback
            } finally {
                loadingItem = null;
            }
        } else {
            selectedItem = item;
        }
    }

    // List Renaming
    function startEditing(list: List) {
        editingListId = list.list_id;
        editingName = list.name;
    }

    async function saveListName() {
        if (!editingListId) return;
        try {
            await updateList(editingListId, { name: editingName });
            await loadLists();
            editingListId = null;
        } catch (e) {
            console.error("Failed to rename list", e);
        }
    }

    // List Reordering
    async function moveList(index: number, direction: "up" | "down") {
        if (direction === "up" && index === 0) return;
        if (direction === "down" && index === lists.length - 1) return;

        const newIndex = direction === "up" ? index - 1 : index + 1;
        const listA = lists[index];
        const listB = lists[newIndex];

        // Swap positions
        const posA = listA.position;
        const posB = listB.position;

        try {
            await updateList(listA.list_id, { position: posB });
            await updateList(listB.list_id, { position: posA });
            await loadLists();
        } catch (e) {
            console.error("Failed to move list", e);
        }
    }

    // Drag and Drop for List Items
    let draggedItem: any = null;
    let draggedFromListId: string | null = null;

    function handleDragStart(event: DragEvent, item: any, listId: string) {
        draggedItem = item;
        draggedFromListId = listId;
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
            // event.dataTransfer.setData("text/plain", JSON.stringify(item));
        }
    }

    function handleDragOver(event: DragEvent) {
        event.preventDefault();
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = "move";
        }
    }

    async function handleDrop(
        event: DragEvent,
        targetItem: any,
        targetListId: string,
    ) {
        event.preventDefault();
        if (!draggedItem || !draggedFromListId) return;
        if (draggedFromListId !== targetListId) return; // Only allow reordering within same list for now
        if (draggedItem.imdb_id === targetItem.imdb_id) return;

        const items = listItemsMap[targetListId];
        const oldIndex = items.findIndex(
            (i) => i.imdb_id === draggedItem.imdb_id,
        );
        const newIndex = items.findIndex(
            (i) => i.imdb_id === targetItem.imdb_id,
        );

        if (oldIndex === -1 || newIndex === -1) return;

        // Reorder array locally
        const newItems = [...items];
        newItems.splice(oldIndex, 1);
        newItems.splice(newIndex, 0, draggedItem);
        listItemsMap[targetListId] = newItems;

        // Update positions in DB
        try {
            // We need to update positions for all affected items or just swap?
            // Ideally update all to be safe and consistent
            const updates = newItems.map((item, index) =>
                updateListItemPosition(targetListId, item.imdb_id, index + 1),
            );
            await Promise.all(updates);
        } catch (e) {
            console.error("Failed to update item positions", e);
            await loadListItems(targetListId); // Revert on error
        }

        draggedItem = null;
        draggedFromListId = null;
    }
</script>

<AddonsModal bind:showAddonsModal />

<div
    class="bg-[#090909] h-screen w-screen flex flex-col overflow-hidden overflow-x-hidden items-center"
>
    <SearchBar
        absolute={false}
        on:openAddons={() => (showAddonsModal = true)}
    />

    {#if loaded}
        <div
            class="flex flex-row gap-[10px] mt-[50px] items-start justify-center w-full max-w-screen h-[calc(100vh-200px)] px-[20px] z-10 rounded-[20px]"
            in:fade={{ duration: 300 }}
        >
            <!-- Left Panel: Lists -->
            <div
                class="w-[45%] h-full flex flex-col overflow-y-scroll no-scrollbar relative z-10 pr-[20px] overflow-x-hidden"
            >
                <div class="flex flex-col gap-[60px] pb-[100px]">
                    {#each lists as list}
                        <div class="flex flex-col gap-[20px]">
                            <div
                                class="flex flex-row justify-between items-center group/header"
                            >
                                {#if editingListId === list.list_id}
                                    <form
                                        class="flex-1 flex flex-row gap-2"
                                        on:submit|preventDefault={saveListName}
                                    >
                                        <input
                                            type="text"
                                            bind:value={editingName}
                                            class="bg-transparent text-[#FFFFFF] text-[32px] font-poppins font-semibold border-b border-white/20 focus:border-white outline-none w-full"
                                            on:blur={saveListName}
                                        />
                                    </form>
                                {:else}
                                    <div
                                        class="flex flex-row gap-4 items-center"
                                    >
                                        <h3
                                            class="text-[#FFFFFF] text-[32px] font-poppins font-semibold cursor-pointer hover:text-white/80 transition-colors"
                                            on:dblclick={() =>
                                                startEditing(list)}
                                        >
                                            {list.name}
                                        </h3>
                                        <div
                                            class="flex flex-col gap-1 opacity-0 group-hover/header:opacity-100 transition-opacity"
                                        >
                                            <button
                                                class="text-white/50 hover:text-white cursor-pointer"
                                                on:click={() =>
                                                    moveList(
                                                        lists.indexOf(list),
                                                        "up",
                                                    )}
                                                disabled={lists.indexOf(
                                                    list,
                                                ) === 0}
                                                aria-label="Move list up"
                                            >
                                                <svg
                                                    width="12"
                                                    height="12"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    stroke-width="2"
                                                    stroke-linecap="round"
                                                    stroke-linejoin="round"
                                                    ><polyline
                                                        points="18 15 12 9 6 15"
                                                    ></polyline></svg
                                                >
                                            </button>
                                            <button
                                                aria-label="Move list down"
                                                class="text-white/50 hover:text-white cursor-pointer"
                                                on:click={() =>
                                                    moveList(
                                                        lists.indexOf(list),
                                                        "down",
                                                    )}
                                                disabled={lists.indexOf(
                                                    list,
                                                ) ===
                                                    lists.length - 1}
                                            >
                                                <svg
                                                    width="12"
                                                    height="12"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    stroke-width="2"
                                                    stroke-linecap="round"
                                                    stroke-linejoin="round"
                                                    ><polyline
                                                        points="6 9 12 15 18 9"
                                                    ></polyline></svg
                                                >
                                            </button>
                                        </div>
                                    </div>
                                {/if}

                                <div class="flex flex-row gap-2">
                                    <button
                                        class="text-white/50 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-lg cursor-pointer"
                                        on:click={() => startEditing(list)}
                                        aria-label="Rename list"
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
                                            ><path
                                                d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
                                            ></path><path
                                                d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
                                            ></path></svg
                                        >
                                    </button>
                                    <button
                                        class="text-[#FF4444] opacity-50 hover:opacity-100 transition-opacity p-2 hover:bg-[#FF4444]/10 rounded-lg cursor-pointer"
                                        on:click={() =>
                                            handleDeleteList(list.list_id)}
                                        aria-label="Delete list"
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
                            </div>

                            <div class="w-full h-[1px] bg-[#333333]"></div>

                            {#if listItemsMap[list.list_id] && listItemsMap[list.list_id].length > 0}
                                <div class="grid grid-cols-4 gap-[20px]">
                                    {#each listItemsMap[list.list_id] as item}
                                        <button
                                            class="flex flex-col gap-[10px] w-full aspect-[2/3] transition-opacity duration-300 group cursor-pointer relative {selectedItem?.imdb_id ===
                                            item.imdb_id
                                                ? 'opacity-60'
                                                : 'hover:opacity-80'} {draggedItem?.imdb_id ===
                                            item.imdb_id
                                                ? 'opacity-30'
                                                : ''}"
                                            on:click={() =>
                                                selectItem(item, list.list_id)}
                                            draggable="true"
                                            on:dragstart={(e) =>
                                                handleDragStart(
                                                    e,
                                                    item,
                                                    list.list_id,
                                                )}
                                            on:dragover={handleDragOver}
                                            on:drop={(e) =>
                                                handleDrop(
                                                    e,
                                                    item,
                                                    list.list_id,
                                                )}
                                        >
                                            <img
                                                src={item.poster}
                                                alt={item.name}
                                                class="w-full h-full object-cover rounded-[12px] bg-[#1a1a1a]"
                                            />
                                            {#if selectedItem?.imdb_id === item.imdb_id}
                                                <div
                                                    class="absolute inset-0 bg-black/20 rounded-[12px]"
                                                ></div>
                                            {/if}

                                            {#if loadingItem === item.imdb_id}
                                                <div
                                                    class="absolute inset-0 flex items-center justify-center bg-black/40 rounded-[12px] backdrop-blur-[2px]"
                                                    transition:fade={{
                                                        duration: 200,
                                                    }}
                                                >
                                                    <div
                                                        class="w-8 h-8 border-4 border-white/20 border-t-white rounded-full animate-spin"
                                                    ></div>
                                                </div>
                                            {/if}
                                        </button>
                                    {/each}
                                </div>
                            {:else}
                                <div
                                    class="text-white/30 text-[16px] font-poppins italic py-4"
                                >
                                    No items in this list
                                </div>
                            {/if}
                        </div>
                    {/each}

                    {#if lists.length === 0}
                        <div
                            class="flex flex-col items-center justify-center h-[400px] text-white/50"
                        >
                            <p class="text-xl font-poppins">No lists found</p>
                            <p class="text-sm font-poppins mt-2">
                                Create a list to get started
                            </p>
                        </div>
                    {/if}
                </div>
            </div>

            <!-- Right Panel: Preview -->
            <div
                class="w-[45%] h-full relative overflow-y-scroll overflow-x-hidden no-scrollbar rounded-[32px]"
            >
                {#if selectedItem}
                    <!-- Trailer Video Background -->
                    <div
                        class="absolute top-0 left-0 right-0 h-auto z-0 overflow-hidden"
                    >
                        {#if selectedItem.trailerStreams && selectedItem.trailerStreams.length > 0}
                            <div
                                class="relative w-full aspect-[16/9] overflow-hidden"
                            >
                                <iframe
                                    bind:this={playerIframe}
                                    frameborder="0"
                                    referrerpolicy="strict-origin-when-cross-origin"
                                    src={`https://www.youtube-nocookie.com/embed/${selectedItem.trailerStreams.at(-1).ytId}?controls=0&modestbranding=1&rel=0&autoplay=1&mute=1&loop=1&playlist=${selectedItem.trailerStreams.at(-1).ytId}&showinfo=0&iv_load_policy=3&disablekb=1&enablejsapi=1`}
                                    class="w-full h-full object-cover scale-[1.35]"
                                    title="Trailer"
                                ></iframe>
                                <div
                                    class="absolute inset-0 bg-gradient-to-t from-[#090909] via-[#090909]/60 to-transparent z-100"
                                ></div>
                            </div>
                        {:else if selectedItem.background}
                            <img
                                src={selectedItem.background}
                                alt="Background"
                                class="w-full h-full object-cover"
                            />
                        {:else}
                            <div
                                class="w-full h-full bg-gradient-to-b from-[#1a1a1a] to-[#090909]"
                            ></div>
                        {/if}
                    </div>

                    <!-- Content Overlay -->
                    <div
                        class="relative z-10 flex flex-col justify-between p-[50px] min-h-full pb-[100px] overflow-x-hidden"
                    >
                        <!-- Top Controls -->
                        <div
                            class="flex flex-row gap-[10px] items-start justify-end"
                        >
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

                        <!-- Bottom Content -->
                        <div class="flex flex-col gap-[30px]">
                            <div
                                class="flex flex-row gap-[20px] w-full items-center"
                            >
                                {#if selectedItem.logo}
                                    <img
                                        src={selectedItem.logo}
                                        alt={selectedItem.name}
                                        class="w-[350px] object-contain max-h-[180px] self-start"
                                    />
                                {:else}
                                    <h1
                                        class="text-white text-[56px] font-bold font-poppins leading-tight"
                                    >
                                        {selectedItem.name}
                                    </h1>
                                {/if}

                                <button
                                    class="bg-white text-black px-[50px] h-fit py-[20px] rounded-full font-poppins font-bold text-[20px] hover:bg-white/90 transition-colors flex items-center gap-3 cursor-pointer z-10"
                                    on:click={() => {
                                        router.navigate("meta", {
                                            imdbId: selectedItem.imdb_id,
                                            type: selectedItem.type,
                                        });
                                    }}
                                >
                                    <svg
                                        width="28"
                                        height="28"
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
                                    Watch
                                </button>
                            </div>

                            <p
                                class="text-white/80 font-poppins text-[18px] leading-relaxed self-center line-clamp-3 max-w-[90%]"
                            >
                                {selectedItem.description ||
                                    "No description available."}
                            </p>

                            <div class="flex flex-col gap-[10px]">
                                <div class="flex flex-row gap-[10px] w-full">
                                    <div
                                        class="px-[50px] py-[30px] w-full bg-[#FFFFFF]/10 backdrop-blur-[16px] rounded-[50px] flex flex-col gap-[20px]"
                                    >
                                        <div
                                            class="flex flex-row gap-[10px] items-center justify-between"
                                        >
                                            <span
                                                class="text-[#E8E8E8] text-[24px] font-poppins font-medium"
                                            >
                                                {selectedItem.year || "N/A"} • {selectedItem.runtime ||
                                                    selectedItem.videos.length}
                                            </span>

                                            <div
                                                class="flex flex-row gap-[10px] items-center"
                                            >
                                                {#if selectedItem.imdbRating}
                                                    <span
                                                        class="text-[#E8E8E8] text-[24px] font-poppins font-medium"
                                                    >
                                                        {selectedItem.imdbRating}
                                                    </span>
                                                    <img
                                                        src="imdb.png"
                                                        alt="IMDb"
                                                        class="w-[50px] h-[24px] object-contain"
                                                    />
                                                {/if}
                                            </div>
                                        </div>
                                    </div>

                                    <button
                                        class="bg-[#FF4444]/20 hover:bg-[#FF4444]/30 h-full p-[30px] aspect-square items-center justify-center text-[#FF6666] rounded-full font-poppins font-medium text-[16px] transition-colors flex items-center gap-2 cursor-pointer"
                                        on:click={handleRemoveFromList}
                                        aria-label="Remove from list"
                                    >
                                        <svg
                                            width="36"
                                            height="36"
                                            viewBox="0 0 59 64"
                                            fill="none"
                                            xmlns="http://www.w3.org/2000/svg"
                                        >
                                            <path
                                                d="M43.75 34.833C51.7581 34.833 58.25 41.3249 58.25 49.333C58.25 57.3411 51.7581 63.833 43.75 63.833C35.7419 63.833 29.25 57.3411 29.25 49.333C29.25 41.3249 35.7419 34.833 43.75 34.833ZM43.75 38.833C37.951 38.833 33.25 43.534 33.25 49.333C33.25 55.132 37.951 59.833 43.75 59.833C49.549 59.833 54.25 55.132 54.25 49.333C54.25 43.534 49.549 38.833 43.75 38.833ZM44.333 20.667C48.8432 20.667 52.4998 24.3228 52.5 28.833V33.2666C50.6313 32.4945 48.6129 32.0122 46.5 31.875V28.833C46.4998 27.6365 45.5295 26.667 44.333 26.667H8.16699C6.97048 26.667 6.00018 27.6365 6 28.833V49.5C6.00018 50.6965 6.97048 51.667 8.16699 51.667H26.2686C26.3596 53.7743 26.7946 55.7922 27.5176 57.667H8.16699C3.65678 57.667 0.000176798 54.0102 0 49.5V28.833C0.000175494 24.3228 3.65677 20.667 8.16699 20.667H44.333ZM46.0859 44.1689C46.867 43.3879 48.133 43.3879 48.9141 44.1689C49.6951 44.95 49.6951 46.216 48.9141 46.9971L46.5781 49.333L48.9141 51.6689C49.6951 52.45 49.6951 53.716 48.9141 54.4971C48.133 55.2781 46.867 55.2781 46.0859 54.4971L43.75 52.1611L41.4141 54.4971C40.633 55.2781 39.367 55.2781 38.5859 54.4971C37.8049 53.716 37.8049 52.45 38.5859 51.6689L40.9219 49.333L38.5859 46.9971C37.8049 46.216 37.8049 44.95 38.5859 44.1689C39.367 43.3879 40.633 43.3879 41.4141 44.1689L43.75 46.5049L46.0859 44.1689ZM44.333 10.333C45.9898 10.333 47.3328 11.6763 47.333 13.333C47.3328 14.9897 45.9898 16.333 44.333 16.333H8.16699C6.51025 16.333 5.16717 14.9897 5.16699 13.333C5.16717 11.6763 6.51025 10.333 8.16699 10.333H44.333ZM39.167 0C40.8237 0.000176531 42.167 1.34325 42.167 3C42.1668 4.6566 40.8236 5.99982 39.167 6H13.333C11.6764 5.99982 10.3332 4.6566 10.333 3C10.333 1.34325 11.6763 0.000175758 13.333 0H39.167Z"
                                                fill="#FF3B30"
                                            />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                {:else}
                    <!-- Empty State for Right Panel -->
                    <div
                        class="w-full h-full flex items-center justify-center text-white/20"
                    >
                        <p class="font-poppins text-xl">
                            Select an item to view details
                        </p>
                    </div>
                {/if}
            </div>
        </div>

        <div class="w-full absolute top-0 left-0 overflow-hidden">
            <svg
                viewBox="0 0 1858 591"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                <g filter="url(#filter0_f_222_680)">
                    <ellipse
                        cx="929"
                        cy="95.5"
                        rx="529"
                        ry="95.5"
                        fill="#D9D9D9"
                        fill-opacity="0.6"
                    />
                </g>
                <defs>
                    <filter
                        id="filter0_f_222_680"
                        x="0"
                        y="-400"
                        width="1858"
                        height="991"
                        filterUnits="userSpaceOnUse"
                        color-interpolation-filters="sRGB"
                    >
                        <feFlood
                            flood-opacity="0"
                            result="BackgroundImageFix"
                        />
                        <feBlend
                            mode="normal"
                            in="SourceGraphic"
                            in2="BackgroundImageFix"
                            result="shape"
                        />
                        <feGaussianBlur
                            stdDeviation="200"
                            result="effect1_foregroundBlur_222_680"
                        />
                    </filter>
                </defs>
            </svg>
        </div>
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
    .no-scrollbar::-webkit-scrollbar {
        display: none;
    }
    .no-scrollbar {
        -ms-overflow-style: none;
        scrollbar-width: none;
    }
</style>
