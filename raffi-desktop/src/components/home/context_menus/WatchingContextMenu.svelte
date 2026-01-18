<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";
    import { fade } from "svelte/transition";

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
        <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"></path></svg
        >
        Remove
    </button>
    <button
        class="text-left px-4 py-2 text-white/80 hover:text-white hover:bg-white/10 transition-colors font-poppins text-sm flex flex-row gap-2 items-center cursor-pointer"
        on:click={handleAddToList}
    >
        <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
        >
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        Add to List
    </button>
    <div class="h-[1px] bg-white/10 my-1"></div>
    <button
        class="text-left px-4 py-2 text-[#FF4444] hover:bg-[#FF4444]/10 transition-colors font-poppins text-sm flex flex-row gap-2 items-center cursor-pointer"
        on:click={handleForget}
    >
        <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            ><path
                d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
            ></path></svg
        >
        Forget
    </button>
</div>
