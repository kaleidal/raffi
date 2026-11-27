<script lang="ts">
    import { portal } from "../../common/portal";
    import { onMount } from "svelte";
    import { fade } from "svelte/transition";
    import { Film, X, Plus, Trash } from "@lucide/svelte";

    let {
        x,
        y,
        showTrailer = false,
        onClose,
        onRemove,
        onForget,
        onAddToList,
        onViewTrailer,
    }: {
        x: number;
        y: number;
        showTrailer?: boolean;
        onClose: () => void;
        onRemove: () => void;
        onForget: () => void;
        onAddToList: () => void;
        onViewTrailer: () => void;
    } = $props();

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
    oncontextmenu={(event) => event.preventDefault()}
    role="menu"
    tabindex="-1"
>
    <button
        class="text-left px-4 py-2 text-ink/80 hover:text-ink hover:bg-ink/10 transition-colors text-sm flex flex-row gap-2 items-center cursor-pointer"
        onclick={handleRemove}
    >
        <X size={16} strokeWidth={2} />
        Remove
    </button>
    {#if showTrailer}
        <button
            class="text-left px-4 py-2 text-ink/80 hover:text-ink hover:bg-ink/10 transition-colors text-sm flex flex-row gap-2 items-center cursor-pointer"
            onclick={handleViewTrailer}
        >
            <Film size={16} strokeWidth={2} />
            View Trailer
        </button>
    {/if}
    <button
        class="text-left px-4 py-2 text-ink/80 hover:text-ink hover:bg-ink/10 transition-colors text-sm flex flex-row gap-2 items-center cursor-pointer"
        onclick={handleAddToList}
    >
        <Plus size={16} strokeWidth={2} />
        Add to List
    </button>
    <div class="h-[1px] bg-ink/10 my-1"></div>
    <button
        class="text-left px-4 py-2 text-danger hover:bg-danger/10 transition-colors text-sm flex flex-row gap-2 items-center cursor-pointer"
        onclick={handleForget}
    >
        <Trash size={16} strokeWidth={2} />
        Forget
    </button>
</div>
