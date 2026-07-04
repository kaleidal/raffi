<script lang="ts">
    import { onMount } from "svelte";
    import { fade } from "svelte/transition";
    import { Star } from "@lucide/svelte";

    export let x = 0;
    export let y = 0;
    export let isFavorite = false;
    export let onClose: () => void = () => {};
    export let onToggleFavorite: () => void = () => {};

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
        onClose();
    }

    function toggleFavorite() {
        onToggleFavorite();
        close();
    }

    function handlePointerDown(event: PointerEvent) {
        const target = event.target as HTMLElement;
        if (!target.closest(".live-channel-context-menu")) {
            close();
        }
    }

    onMount(() => {
        document.addEventListener("pointerdown", handlePointerDown);
        return () => {
            document.removeEventListener("pointerdown", handlePointerDown);
        };
    });
</script>

<svelte:window onkeydown={(event) => {
    if (event.key === "Escape") close();
}} />

<div
    use:portal
    class="live-channel-context-menu fixed z-[300] flex min-w-[190px] flex-col rounded-xl bg-[#181818] py-2 shadow-[0_18px_48px_rgba(0,0,0,0.36)]"
    style="top: {y}px; left: {x}px;"
    transition:fade={{ duration: 100 }}
    oncontextmenu={(event) => event.preventDefault()}
    role="menu"
    tabindex="-1"
>
    <button
        class="flex cursor-pointer flex-row items-center gap-2 px-4 py-2 text-left font-poppins text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        onclick={toggleFavorite}
        role="menuitem"
    >
        <Star size={16} strokeWidth={2} />
        {isFavorite ? "Remove from Favorites" : "Add to Favorites"}
    </button>
</div>
