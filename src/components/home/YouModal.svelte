<script lang="ts">
    import { onMount, createEventDispatcher } from "svelte";
    import { fade } from "svelte/transition";
    import { router } from "../../lib/stores/router";
    import {
        getLists,
        deleteList,
        getLibrary,
        getAddons,
        getListItems,
        type List,
    } from "../../lib/db/db";
    import { supabase } from "../../lib/db/supabase";
    import { getMetaData } from "../../lib/library/library";

    const dispatch = createEventDispatcher();

    let lists: List[] = [];
    let listItemsMap: Record<string, any[]> = {};

    export let visible = false;

    onMount(async () => {
        await loadLists();
    });

    async function loadLists() {
        try {
            lists = await getLists();
            for (const list of lists) {
                await loadListItems(list.list_id);
            }
        } catch (e) {
            console.error("Failed to load lists", e);
        }
    }

    async function loadListItems(listId: string) {
        try {
            const items = await getListItems(listId);
            const metaPromises = items.map((item) =>
                getMetaData(item.imdb_id, item.type),
            );
            const metas = await Promise.all(metaPromises);
            listItemsMap[listId] = metas
                .filter((m) => m && m.meta)
                .map((m) => m.meta);
        } catch (e) {
            console.error("Failed to load list items", e);
        }
    }

    async function handleDeleteList(listId: string) {
        if (!confirm("Are you sure you want to delete this list?")) return;
        try {
            await deleteList(listId);
            await loadLists();
        } catch (e) {
            console.error("Failed to delete list", e);
        }
    }

    async function handleLogout() {
        await supabase.auth.signOut();
        router.navigate("login");
    }

    async function handleExportData() {
        try {
            const library = await getLibrary();
            const addons = await getAddons();
            const userLists = await getLists();
            const listsWithItems = await Promise.all(
                userLists.map(async (list) => {
                    const items = await getListItems(list.list_id);
                    return { ...list, items };
                }),
            );

            const data = {
                library,
                addons,
                lists: listsWithItems,
                exportedAt: new Date().toISOString(),
            };

            const blob = new Blob([JSON.stringify(data, null, 2)], {
                type: "application/json",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `raffi-export-${new Date().toISOString().split("T")[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error("Failed to export data", e);
            alert("Failed to export data");
        }
    }

    function close() {
        dispatch("close");
    }
</script>

{#if visible}
    <div
        class="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xl flex items-center justify-center p-[100px]"
        on:click|self={close}
        on:keydown={(e) => e.key === "Escape" && close()}
        role="button"
        tabindex="0"
        transition:fade={{ duration: 200 }}
    >
        <div
            class="w-full h-full bg-[#090909] rounded-[32px] p-[50px] flex flex-col gap-[50px] overflow-y-auto relative"
        >
            <button
                class="absolute top-[30px] right-[30px] bg-[#FFFFFF]/10 hover:bg-[#FFFFFF]/20 p-3 rounded-full transition-colors duration-200 cursor-pointer z-50"
                on:click={close}
                aria-label="Close"
            >
                <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
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

            <div class="flex flex-row items-center gap-[20px]">
                <h1 class="text-white text-[48px] font-poppins font-bold">
                    You
                </h1>
            </div>

            <div class="flex flex-col gap-[30px]">
                <div class="flex flex-col gap-[100px]">
                    {#each lists as list}
                        <div class="flex flex-col gap-[20px]">
                            <div
                                class="flex flex-row justify-between items-center"
                            >
                                <h3
                                    class="text-[#FFFFFF]/80 text-[24px] font-poppins font-medium"
                                >
                                    {list.name}
                                </h3>
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

                            {#if listItemsMap[list.list_id] && listItemsMap[list.list_id].length > 0}
                                <div class="flex flex-row flex-wrap gap-[20px]">
                                    {#each listItemsMap[list.list_id] as item}
                                        <button
                                            class="flex flex-col gap-[10px] w-[150px] group cursor-pointer"
                                            on:click={() => {
                                                router.navigate("meta", {
                                                    imdbId: item.imdb_id,
                                                    type: item.type,
                                                });
                                                close();
                                            }}
                                        >
                                            <img
                                                src={item.poster}
                                                alt={item.name}
                                                class="w-full h-[225px] object-cover rounded-[16px] group-hover:opacity-80 transition-opacity duration-200"
                                            />
                                        </button>
                                    {/each}
                                </div>
                            {:else}
                                <div
                                    class="text-white/30 text-[14px] font-poppins italic"
                                >
                                    No items in this list
                                </div>
                            {/if}
                        </div>
                    {/each}
                </div>
            </div>

            <div class="w-full h-[1px] bg-[#333333]"></div>

            <div class="flex flex-col gap-[30px]">
                <div class="flex flex-row gap-[20px]">
                    <button
                        class="bg-[#181818] hover:bg-[#202020] text-white px-[40px] py-[20px] rounded-[24px] cursor-pointer font-poppins font-medium transition-colors flex flex-row gap-[10px] items-center"
                        on:click={handleExportData}
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
                            ><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
                            ></path><polyline points="7 10 12 15 17 10"
                            ></polyline><line x1="12" y1="15" x2="12" y2="3"
                            ></line></svg
                        >
                        Export Data
                    </button>

                    <button
                        class="bg-[#181818] hover:bg-[#FF4444]/10 text-[#FF4444] px-[40px] py-[20px] rounded-[24px] cursor-pointer font-poppins font-medium transition-colors flex flex-row gap-[10px] items-center"
                        on:click={handleLogout}
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
                            ><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"
                            ></path><polyline points="16 17 21 12 16 7"
                            ></polyline><line x1="21" y1="12" x2="9" y2="12"
                            ></line></svg
                        >
                        Log Out
                    </button>
                </div>
            </div>
        </div>
    </div>
{/if}
