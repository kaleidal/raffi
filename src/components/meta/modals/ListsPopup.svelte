<script lang="ts">
    import { fade } from "svelte/transition";
    import { createEventDispatcher, onMount } from "svelte";
    import {
        getLists,
        addToList,
        removeFromList,
        createList,
        type List,
    } from "../../../lib/db/db";
    import { supabase } from "../../../lib/db/supabase";
    import LoadingSpinner from "../../common/LoadingSpinner.svelte";

    export let visible = false;
    export let imdbId: string;
    export let type: string;

    const dispatch = createEventDispatcher();

    let lists: List[] = [];
    let memberOf: Set<string> = new Set();
    let loading = false;
    let newListName = "";
    let creatingList = false;

    async function handleCreateList() {
        if (!newListName.trim()) return;
        creatingList = true;
        try {
            await createList(newListName);
            newListName = "";
            await loadLists();
        } catch (e) {
            console.error("Failed to create list", e);
        } finally {
            creatingList = false;
        }
    }

    function close() {
        dispatch("close");
    }

    async function loadLists() {
        loading = true;
        try {
            lists = await getLists();

            const { data: items } = await supabase
                .from("list_items")
                .select("list_id")
                .eq("imdb_id", imdbId);

            memberOf = new Set(items?.map((i) => i.list_id) || []);
        } catch (e) {
            console.error("Failed to load lists", e);
        } finally {
            loading = false;
        }
    }

    async function toggleList(listId: string) {
        try {
            if (memberOf.has(listId)) {
                await removeFromList(listId, imdbId);
                memberOf.delete(listId);
                memberOf = memberOf;
            } else {
                await addToList(listId, imdbId, 0, type);
                memberOf.add(listId);
                memberOf = memberOf;
            }
        } catch (e) {
            console.error("Failed to toggle list", e);
        }
    }

    $: if (visible) {
        loadLists();
    }
</script>

{#if visible}
    <div
        class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-20"
        on:click|self={close}
        on:keydown={(e) => e.key === "Escape" && close()}
        role="button"
        tabindex="0"
        transition:fade={{ duration: 200 }}
    >
        <div
            class="bg-[#121212] w-full max-w-md max-h-[80vh] rounded-[32px] p-8 flex flex-col gap-6 overflow-hidden relative"
        >
            <button
                class="absolute top-6 right-6 text-white/50 hover:text-white cursor-pointer"
                on:click={close}
                aria-label="Close"
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
                Add to List
            </h2>

            <div class="flex flex-col gap-3 overflow-y-auto pr-2">
                <div class="relative">
                    <input
                        type="text"
                        placeholder="+ Create new list"
                        class="w-full bg-transparent border-2 border-dashed border-white/20 text-white px-4 py-3 rounded-xl outline-none focus:border-white/50 font-poppins transition-colors placeholder:text-white/30"
                        bind:value={newListName}
                        on:keydown={(e) =>
                            e.key === "Enter" && handleCreateList()}
                        disabled={creatingList}
                    />
                </div>

                {#if loading}
                    <div class="flex justify-center py-4">
                        <LoadingSpinner size="30px" />
                    </div>
                {:else if lists.length === 0}
                    <div class="text-white/50 text-center py-4">
                        No lists found. Create one above.
                    </div>
                {:else}
                    {#each lists as list}
                        <button
                            class="w-full bg-white/5 hover:bg-white/10 p-4 rounded-xl flex flex-row justify-between items-center transition-colors cursor-pointer"
                            on:click={() => toggleList(list.list_id)}
                        >
                            <span class="text-white font-medium font-poppins"
                                >{list.name}</span
                            >
                            {#if memberOf.has(list.list_id)}
                                <div
                                    class="bg-white text-black p-1 rounded-full"
                                >
                                    <svg
                                        width="16"
                                        height="16"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="3"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        ><polyline points="20 6 9 17 4 12"
                                        ></polyline></svg
                                    >
                                </div>
                            {/if}
                        </button>
                    {/each}
                {/if}
            </div>
        </div>
    </div>
{/if}
