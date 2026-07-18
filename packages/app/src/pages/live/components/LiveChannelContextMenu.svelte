<script lang="ts">
    import { onMount, tick } from "svelte";
    import { fade } from "svelte/transition";
    import { Star } from "@lucide/svelte";

    export let x = 0;
    export let y = 0;
    export let isFavorite = false;
    export let ariaLabel = "Channel actions";
    export let returnFocusTo: HTMLElement | null = null;
    export let onClose: () => void = () => {};
    export let onToggleFavorite: () => void = () => {};

    const VIEWPORT_PADDING = 8;
    const hiddenMenuStyle = "position: fixed; top: 0; left: 0; visibility: hidden;";
    const capturedScrollOptions = { capture: true } as const;
    const capturedPassiveOptions = { capture: true, passive: true } as const;

    let menuEl: HTMLDivElement | null = null;
    let favoriteButtonEl: HTMLButtonElement | null = null;
    let menuStyle = hiddenMenuStyle;
    let menuReady = false;
    let positionKey = "";

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

    function getEffectiveZoom() {
        if (typeof document === "undefined") return 1;
        const zoom = Number.parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue("--raffi-effective-zoom") || "1",
        );
        return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
    }

    function clamp(value: number, min: number, max: number) {
        if (max < min) return min;
        return Math.max(min, Math.min(value, max));
    }

    async function updatePosition() {
        if (!menuEl || typeof window === "undefined") return;

        menuReady = false;
        menuStyle = hiddenMenuStyle;
        await tick();

        if (!menuEl || typeof window === "undefined") return;

        const zoom = getEffectiveZoom();
        const naturalMenuWidth = menuEl.offsetWidth;
        const naturalMenuHeight = menuEl.offsetHeight;
        const visualMenuWidth = naturalMenuWidth * zoom;
        const visualMenuHeight = naturalMenuHeight * zoom;
        const maxLeft = window.innerWidth - visualMenuWidth - VIEWPORT_PADDING;
        const maxTop = window.innerHeight - visualMenuHeight - VIEWPORT_PADDING;
        const left = clamp(x, VIEWPORT_PADDING, maxLeft);
        const top = clamp(y, VIEWPORT_PADDING, maxTop);

        menuStyle = `position: fixed; top: ${top}px; left: ${left}px; transform: scale(${zoom}); transform-origin: top left;`;
        menuReady = true;
    }

    function restoreTriggerFocus() {
        if (!returnFocusTo?.isConnected) return;
        try {
            returnFocusTo.focus({ preventScroll: true });
        } catch {
            returnFocusTo.focus();
        }
    }

    function close() {
        restoreTriggerFocus();
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

    function handleResize() {
        void updatePosition();
    }

    function handleViewportDismiss() {
        close();
    }

    $: if (menuEl) {
        const nextPositionKey = `${x}:${y}:${isFavorite}`;
        if (positionKey !== nextPositionKey) {
            positionKey = nextPositionKey;
            void updatePosition();
        }
    }

    onMount(() => {
        document.addEventListener("pointerdown", handlePointerDown);
        window.addEventListener("resize", handleResize);
        window.addEventListener("scroll", handleViewportDismiss, capturedScrollOptions);
        window.addEventListener("wheel", handleViewportDismiss, capturedPassiveOptions);

        void (async () => {
            await updatePosition();
            favoriteButtonEl?.focus({ preventScroll: true });
        })();

        return () => {
            document.removeEventListener("pointerdown", handlePointerDown);
            window.removeEventListener("resize", handleResize);
            window.removeEventListener("scroll", handleViewportDismiss, capturedScrollOptions);
            window.removeEventListener("wheel", handleViewportDismiss, capturedPassiveOptions);
        };
    });
</script>

<svelte:window onkeydown={(event) => {
    if (event.key === "Escape") close();
}} />

<div
    use:portal
    bind:this={menuEl}
    class={`live-channel-context-menu fixed z-[300] flex min-w-[190px] flex-col rounded-xl bg-[#181818] py-2 shadow-[0_18px_48px_rgba(0,0,0,0.36)] ${menuReady ? "opacity-100" : "opacity-0"}`}
    style={menuStyle}
    transition:fade={{ duration: 100 }}
    oncontextmenu={(event) => event.preventDefault()}
    role="menu"
    aria-label={ariaLabel}
    tabindex="-1"
>
    <button
        bind:this={favoriteButtonEl}
        type="button"
        class="flex cursor-pointer flex-row items-center gap-2 px-4 py-2 text-left font-poppins text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white/70"
        onclick={toggleFavorite}
        role="menuitem"
    >
        <Star size={16} strokeWidth={2} />
        {isFavorite ? "Remove from Favorites" : "Add to Favorites"}
    </button>
</div>
