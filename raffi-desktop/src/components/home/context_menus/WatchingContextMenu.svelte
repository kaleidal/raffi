<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";
    import { fade } from "svelte/transition";
    import { X, Plus, Trash } from "lucide-svelte";

    export let x: number;
    export let y: number;

    const dispatch = createEventDispatcher();

    const portal = (node: HTMLElement) => {
        if (typeof document === "undefined") {
            return { destroy() {} };
        }
        document.body.appendChild(node);
        return {
            destroy() {
                if (node.parentNode) {
                    node.parentNode.removeChild(node);
                }
            },
        };
    };


    function close() {
        dispatch("close");
    }

    function handleRemove() {
        dispatch("remove");
        close();
    }

    function handleForget() {
        dispatch("forget");
        close();
    }

    function handleAddToList() {
        dispatch("addToList");
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
    class="fixed z-[100] context-menu bg-[#181818] rounded-xl py-2 min-w-[150px] flex flex-col"
    style="top: {y}px; left: {x}px;"
    transition:fade={{ duration: 100 }}
    on:contextmenu|preventDefault
    role="menu"
    tabindex="-1"
>
    <button
        class="text-left px-4 py-2 text-white/80 hover:text-white hover:bg-white/10 transition-colors font-poppins text-sm flex flex-row gap-2 items-center cursor-pointer"
        on:click={handleRemove}
    >
        <X size={16} strokeWidth={2} />
        Remove
    </button>
    <button
        class="text-left px-4 py-2 text-white/80 hover:text-white hover:bg-white/10 transition-colors font-poppins text-sm flex flex-row gap-2 items-center cursor-pointer"
        on:click={handleAddToList}
    >
        <Plus size={16} strokeWidth={2} />
        Add to List
    </button>
    <div class="h-[1px] bg-white/10 my-1"></div>
    <button
        class="text-left px-4 py-2 text-[#FF4444] hover:bg-[#FF4444]/10 transition-colors font-poppins text-sm flex flex-row gap-2 items-center cursor-pointer"
        on:click={handleForget}
    >
        <Trash size={16} strokeWidth={2} />
        Forget
    </button>
</div>
