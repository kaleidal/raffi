<script lang="ts">
    import { onMount } from "svelte";
    import { fade } from "svelte/transition";
    import { Star, StarOff } from "@lucide/svelte";
    import { portal } from "../../../components/common/portal";

    export let x: number;
    export let y: number;
    export let favourite: boolean;
    export let onToggleFavourite: () => void;
    export let onClose: () => void;

    let menu: HTMLDivElement;

    onMount(() => {
        const left = Math.min(x, window.innerWidth - menu.offsetWidth - 12);
        const top = Math.min(y, window.innerHeight - menu.offsetHeight - 12);
        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
        const close = (event: Event) => {
            if (!menu.contains(event.target as Node)) onClose();
        };
        const escape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
        window.addEventListener("pointerdown", close, true);
        window.addEventListener("keydown", escape);
        return () => {
            window.removeEventListener("pointerdown", close, true);
            window.removeEventListener("keydown", escape);
        };
    });
</script>

<div
    bind:this={menu}
    use:portal
    class="fixed z-[100] flex min-w-[180px] flex-col rounded-xl bg-[#181818] py-2"
    transition:fade={{ duration: 100 }}
    oncontextmenu={(event) => event.preventDefault()}
    role="menu"
    tabindex="-1"
>
    <button
        class="flex flex-row items-center gap-2 px-4 py-2 text-left font-poppins text-sm text-white/80 hover:bg-white/10 hover:text-white cursor-pointer"
        onclick={() => {
            onToggleFavourite();
            onClose();
        }}
    >
        {#if favourite}
            <StarOff size={16} strokeWidth={2} />
            Remove from Favourites
        {:else}
            <Star size={16} strokeWidth={2} />
            Add to Favourites
        {/if}
    </button>
</div>
