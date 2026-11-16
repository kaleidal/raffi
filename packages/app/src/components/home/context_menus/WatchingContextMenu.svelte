<script lang="ts">
    import { portal } from "../../common/portal";
    import { onMount } from "svelte";
    import { fade } from "svelte/transition";
    import { Film, X, Plus, Trash } from "@lucide/svelte";

    export let x: number;
    export let y: number;
    export let showTrailer = false;

    export let onClose: () => void = () => {};
    export let onRemove: () => void = () => {};
    export let onForget: () => void = () => {};
    export let onAddToList: () => void = () => {};
    export let onViewTrailer: () => void = () => {};

    function close() {
        onClose();
    }

    function handleRemove() {
        onRemove();
        close();
    }

    function handleForget() {
        onForget();
        close();
    }

    function handleAddToList() {
        onAddToList();
        close();
    }

    function handleViewTrailer() {
        onViewTrailer();
        close();
    }

    function handleClickOutside(event: MouseEvent) {
        const target = event.target as HTMLElement;
        if (!target.closest(".context-menu")) {
            close();
        }
    }

    onMount(() => {
        document.addEventListener("click", handleClickOutside);
        return () => {
            document.removeEventListener("click", handleClickOutside);
        };
    });
</script>

<div
    use:portal
    class="fixed z-[100] context-menu bg-surface rounded-xl py-2 min-w-[150px] flex flex-col"
    style="top: {y}px; left: {x}px;"
    transition:fade={{ duration: 100 }}
    on:contextmenu|preventDefault
    role="menu"
    tabindex="-1"
>
    <button
        class="text-left px-4 py-2 text-ink/80 hover:text-ink hover:bg-ink/10 transition-colors text-sm flex flex-row gap-2 items-center cursor-pointer"
        on:click={handleRemove}
    >
        <X size={16} strokeWidth={2} />
        Remove
    </button>
    {#if showTrailer}
        <button
            class="text-left px-4 py-2 text-ink/80 hover:text-ink hover:bg-ink/10 transition-colors text-sm flex flex-row gap-2 items-center cursor-pointer"
            on:click={handleViewTrailer}
        >
            <Film size={16} strokeWidth={2} />
            View Trailer
        </button>
    {/if}
    <button
        class="text-left px-4 py-2 text-ink/80 hover:text-ink hover:bg-ink/10 transition-colors text-sm flex flex-row gap-2 items-center cursor-pointer"
        on:click={handleAddToList}
    >
        <Plus size={16} strokeWidth={2} />
        Add to List
    </button>
    <div class="h-[1px] bg-ink/10 my-1"></div>
    <button
        class="text-left px-4 py-2 text-danger hover:bg-danger/10 transition-colors text-sm flex flex-row gap-2 items-center cursor-pointer"
        on:click={handleForget}
    >
        <Trash size={16} strokeWidth={2} />
        Forget
    </button>
</div>
