<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";
    import { fade } from "svelte/transition";
    import { Play, Check, CircleX, CheckCircle, Ban, Trash } from "lucide-svelte";

    export let x: number;
    export let y: number;

    const dispatch = createEventDispatcher();

    export const portal = (node: HTMLElement) => {
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

    function handleWatch() {
        dispatch("watch");
        close();
    }

    function handleMarkWatched() {
        dispatch("markWatched");
        close();
    }

    function handleMarkUnwatched() {
        dispatch("markUnwatched");
        close();
    }

    function handleResetProgress() {
        dispatch("resetProgress");
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
    class="fixed z-[300] context-menu bg-[#181818] rounded-xl py-2 min-w-[200px] flex flex-col"
    style={`top: ${y}px; left: ${x}px;`}
    transition:fade={{ duration: 100 }}
    on:contextmenu|preventDefault
    role="menu"
    tabindex="-1"
>
    <button
        class="text-left px-4 py-2 text-white/80 hover:text-white hover:bg-white/10 transition-colors font-poppins text-sm flex flex-row gap-2 items-center cursor-pointer"
        on:click={handleWatch}
    >
        <Play size={16} strokeWidth={2} />
        Watch
    </button>
    <button
        class="text-left px-4 py-2 text-white/80 hover:text-white hover:bg-white/10 transition-colors font-poppins text-sm flex flex-row gap-2 items-center cursor-pointer"
        on:click={handleMarkWatched}
    >
        <Check size={16} strokeWidth={2} />
        Mark as Watched
    </button>
    <button
        class="text-left px-4 py-2 text-white/80 hover:text-white hover:bg-white/10 transition-colors font-poppins text-sm flex flex-row gap-2 items-center cursor-pointer"
        on:click={handleMarkUnwatched}
    >
        <CircleX size={16} strokeWidth={2} />
        Mark as Unwatched
    </button>
    <button
        class="text-left px-4 py-2 text-white/80 hover:text-white hover:bg-white/10 transition-colors font-poppins text-sm flex flex-row gap-2 items-center cursor-pointer"
        on:click={() => {
            dispatch("markSeasonWatched");
            close();
        }}
    >
        <CheckCircle size={16} strokeWidth={2} />
        Mark Season as Watched
    </button>
    <button
        class="text-left px-4 py-2 text-white/80 hover:text-white hover:bg-white/10 transition-colors font-poppins text-sm flex flex-row gap-2 items-center cursor-pointer"
        on:click={() => {
            dispatch("markSeasonUnwatched");
            close();
        }}
    >
        <Ban size={16} strokeWidth={2} />
        Mark Season as Unwatched
    </button>
    <div class="h-[1px] bg-white/10 my-1"></div>
    <button
        class="text-left px-4 py-2 text-[#FF4444] hover:bg-[#FF4444]/10 transition-colors font-poppins text-sm flex flex-row gap-2 items-center cursor-pointer"
        on:click={handleResetProgress}
    >
        <Trash size={16} strokeWidth={2} />
        Reset Progress
    </button>
</div>
