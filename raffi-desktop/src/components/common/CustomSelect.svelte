<script lang="ts">
    import { createEventDispatcher, onDestroy, tick } from "svelte";
    import { ChevronDown } from "@lucide/svelte";

    export let value = "";
    export let options: Array<{ label: string; value: string }> = [];
    export let placeholder = "Select";
    export let buttonClass = "";
    export let menuClass = "";
    export let align: "left" | "right" = "left";
    export let disabled = false;

    const dispatch = createEventDispatcher<{ change: { value: string } }>();

    let open = false;
    let root: HTMLDivElement | null = null;
    let buttonEl: HTMLButtonElement | null = null;
    let menuEl: HTMLDivElement | null = null;
    let menuStyle = "";
    let menuReady = false;

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

    const handlePointerDown = (event: MouseEvent) => {
        if (!root) return;
        if (
            event.target instanceof Node &&
            !root.contains(event.target) &&
            !(menuEl && menuEl.contains(event.target))
        ) {
            open = false;
        }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
            open = false;
        }
    };

    const handleViewportChange = () => {
        if (open) {
            updateMenuPosition();
        }
    };

    if (typeof window !== "undefined") {
        window.addEventListener("mousedown", handlePointerDown);
        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("resize", handleViewportChange);
        window.addEventListener("scroll", handleViewportChange, true);
    }

    onDestroy(() => {
        if (typeof window === "undefined") return;
        window.removeEventListener("mousedown", handlePointerDown);
        window.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("resize", handleViewportChange);
        window.removeEventListener("scroll", handleViewportChange, true);
    });

    $: selectedOption = options.find((option) => option.value === value) ?? null;

    async function toggleOpen() {
        if (disabled) return;
        open = !open;
        if (open) {
            menuReady = false;
            menuStyle = "position: fixed; top: 0; left: 0; visibility: hidden;";
            await tick();
            updateMenuPosition();
        } else {
            menuReady = false;
        }
    }

    function selectOption(nextValue: string) {
        value = nextValue;
        open = false;
        menuReady = false;
        dispatch("change", { value: nextValue });
    }

    function updateMenuPosition() {
        if (!buttonEl || !menuEl || typeof window === "undefined") return;

        const buttonRect = buttonEl.getBoundingClientRect();
        const zoom = Number.parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue("--raffi-effective-zoom") || "1",
        ) || 1;
        const naturalMenuWidth = Math.max(menuEl.offsetWidth, buttonRect.width / zoom);
        const naturalMenuHeight = menuEl.offsetHeight;
        const visualMenuWidth = naturalMenuWidth * zoom;
        const visualMenuHeight = naturalMenuHeight * zoom;
        const viewportPadding = 12;
        const gap = 8;

        const spaceBelow = window.innerHeight - buttonRect.bottom - viewportPadding;
        const spaceAbove = buttonRect.top - viewportPadding;
        const shouldOpenUp = spaceBelow < visualMenuHeight && spaceAbove > spaceBelow;

        let top = shouldOpenUp
            ? buttonRect.top - visualMenuHeight - gap
            : buttonRect.bottom + gap;
        top = Math.max(
            viewportPadding,
            Math.min(top, window.innerHeight - visualMenuHeight - viewportPadding),
        );

        let left = align === "right" ? buttonRect.right - visualMenuWidth : buttonRect.left;
        left = Math.max(
            viewportPadding,
            Math.min(left, window.innerWidth - visualMenuWidth - viewportPadding),
        );

        menuStyle = `position: fixed; top: ${top}px; left: ${left}px; min-width: ${naturalMenuWidth}px; transform: scale(${zoom}); transform-origin: top left;`;
        menuReady = true;
    }

    $: if (open) {
        tick().then(updateMenuPosition);
    }
</script>

<div class="relative min-w-0" bind:this={root}>
    <button
        type="button"
        bind:this={buttonEl}
        class={`flex min-w-0 w-full items-center justify-between gap-3 ${buttonClass}`}
        on:click|stopPropagation={toggleOpen}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
    >
        <span class="truncate">{selectedOption?.label ?? placeholder}</span>
        <ChevronDown size={16} strokeWidth={2} class={`shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
    </button>

    {#if open}
        <div
            use:portal
            bind:this={menuEl}
            style={menuStyle}
            class={`z-400 overflow-hidden rounded-2xl bg-[#181818] p-2 shadow-[0_20px_60px_rgba(0,0,0,0.45)] ${menuReady ? 'opacity-100' : 'opacity-0'} ${menuClass}`}
            role="listbox"
        >
            {#each options as option}
                <button
                    type="button"
                    class={`flex w-full items-center rounded-xl px-3 py-2 text-left text-sm transition-colors duration-200 ${value === option.value ? 'bg-white text-black' : 'text-white/78 hover:bg-white/8 hover:text-white'}`}
                    on:click|stopPropagation={() => selectOption(option.value)}
                    role="option"
                    aria-selected={value === option.value}
                >
                    {option.label}
                </button>
            {/each}
        </div>
    {/if}
</div>