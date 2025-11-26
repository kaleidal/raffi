<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";
    import { fade } from "svelte/transition";

    export let x: number;
    export let y: number;

    const dispatch = createEventDispatcher();

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
    class="fixed z-[100] context-menu bg-[#181818] rounded-xl py-2 min-w-[200px] flex flex-col"
    style="top: {y}px; left: {x}px;"
    transition:fade={{ duration: 100 }}
    on:contextmenu|preventDefault
    role="menu"
    tabindex="-1"
>
    <button
        class="text-left px-4 py-2 text-white/80 hover:text-white hover:bg-white/10 transition-colors font-poppins text-sm flex flex-row gap-2 items-center cursor-pointer"
        on:click={handleWatch}
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
            ><polygon points="5 3 19 12 5 21 5 3"></polygon></svg
        >
        Watch
    </button>
    <button
        class="text-left px-4 py-2 text-white/80 hover:text-white hover:bg-white/10 transition-colors font-poppins text-sm flex flex-row gap-2 items-center cursor-pointer"
        on:click={handleMarkWatched}
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
            ><polyline points="20 6 9 17 4 12"></polyline></svg
        >
        Mark as Watched
    </button>
    <button
        class="text-left px-4 py-2 text-white/80 hover:text-white hover:bg-white/10 transition-colors font-poppins text-sm flex flex-row gap-2 items-center cursor-pointer"
        on:click={handleMarkUnwatched}
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
            ><circle cx="12" cy="12" r="10"></circle><line
                x1="15"
                y1="9"
                x2="9"
                y2="15"
            ></line><line x1="9" y1="9" x2="15" y2="15"></line></svg
        >
        Mark as Unwatched
    </button>
    <button
        class="text-left px-4 py-2 text-white/80 hover:text-white hover:bg-white/10 transition-colors font-poppins text-sm flex flex-row gap-2 items-center cursor-pointer"
        on:click={() => {
            dispatch("markSeasonWatched");
            close();
        }}
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
            ><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline
                points="22 4 12 14.01 9 11.01"
            ></polyline></svg
        >
        Mark Season as Watched
    </button>
    <button
        class="text-left px-4 py-2 text-white/80 hover:text-white hover:bg-white/10 transition-colors font-poppins text-sm flex flex-row gap-2 items-center cursor-pointer"
        on:click={() => {
            dispatch("markSeasonUnwatched");
            close();
        }}
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
            ><circle cx="12" cy="12" r="10"></circle><line
                x1="4.93"
                y1="4.93"
                x2="19.07"
                y2="19.07"
            ></line></svg
        >
        Mark Season as Unwatched
    </button>
    <div class="h-[1px] bg-white/10 my-1"></div>
    <button
        class="text-left px-4 py-2 text-[#FF4444] hover:bg-[#FF4444]/10 transition-colors font-poppins text-sm flex flex-row gap-2 items-center cursor-pointer"
        on:click={handleResetProgress}
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
        Reset Progress
    </button>
</div>
