<script lang="ts">
    import { Check, Plus } from "@lucide/svelte";
    import { SvelteSet } from "svelte/reactivity";
    import {
        getLists,
        addToList,
        removeFromList,
        createList,
        getListMembershipByImdb,
        type List,
    } from "../../../lib/db/db";
    import Dialog from "../../common/dialog/Dialog.svelte";
    import BusyIcon from "../../common/loading/BusyIcon.svelte";
    import ShapeLoader from "../../common/loading/ShapeLoader.svelte";

    let {
        visible = $bindable(false),
        imdbId,
        type,
        onClose = () => {},
    }: {
        visible?: boolean;
        imdbId: string;
        type: string;
        onClose?: () => void;
    } = $props();

    let lists = $state.raw<List[]>([]);
    let memberOf = $state.raw(new SvelteSet<string>());
    let loading = $state(false);
    let newListName = $state("");
    let creatingList = $state(false);

    async function handleCreateList() {
        if (!newListName.trim()) return;
        creatingList = true;
        await createList(newListName);
        newListName = "";
        await loadLists();
        creatingList = false;
    }

    function close() {
        visible = false;
        onClose();
    }

    async function loadLists() {
        loading = true;
        lists = await getLists();
        memberOf = new SvelteSet(await getListMembershipByImdb(imdbId));
        loading = false;
    }

    async function toggleList(listId: string) {
        if (memberOf.has(listId)) {
            await removeFromList(listId, imdbId);
            memberOf.delete(listId);
        } else {
            await addToList(listId, imdbId, 0, type);
            memberOf.add(listId);
        }
    }

    $effect(() => {
        if (visible) loadLists();
    });
</script>

{#if visible}
    <Dialog title="Add to list" onClose={close} class="max-h-[80vh] max-w-[440px]">
        <form
            class="flex items-center gap-2 rounded-full bg-ink/6 py-1.5 pr-1.5 pl-5 focus-within:bg-ink/10"
            onsubmit={(event) => {
                event.preventDefault();
                void handleCreateList();
            }}
        >
            <input
                class="min-w-0 flex-1 bg-transparent py-1.5 outline-none placeholder:text-ink/35"
                placeholder="New list"
                bind:value={newListName}
                disabled={creatingList}
            />
            <button
                class="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-accent text-on-accent transition-opacity disabled:cursor-default disabled:opacity-40"
                aria-label="Create list"
                disabled={creatingList || !newListName.trim()}
            >
                <span class="size-[18px]">
                    <BusyIcon busy={creatingList} size="100%">
                        <Plus class="size-full" strokeWidth={2.5} />
                    </BusyIcon>
                </span>
            </button>
        </form>

        <div class="-mx-2 flex min-h-0 flex-col gap-0.5 overflow-y-auto">
            {#if loading}
                <div class="flex justify-center py-6">
                    <ShapeLoader size="30px" />
                </div>
            {:else if lists.length === 0}
                <p class="py-6 text-center text-ink/50">No lists yet</p>
            {:else}
                {#each lists as list (list.list_id)}
                    {@const member = memberOf.has(list.list_id)}
                    <button
                        class="flex w-full cursor-pointer items-center justify-between gap-3 rounded-[16px] px-4 py-3 text-left transition-colors hover:bg-ink/8"
                        aria-pressed={member}
                        onclick={() => toggleList(list.list_id)}
                    >
                        <span class="truncate font-medium {member ? 'text-ink' : 'text-ink/75'}">{list.name}</span>
                        {#if member}
                            <Check size={18} strokeWidth={2.5} class="shrink-0 text-accent" />
                        {/if}
                    </button>
                {/each}
            {/if}
        </div>
    </Dialog>
{/if}
