<script lang="ts">
    import { fade } from "svelte/transition";
    import { Plus, Settings2 } from "@lucide/svelte";
    import { portal } from "../../../components/common/portal";
    import type { LiveSource } from "../../../lib/live/types";

    export let sources: LiveSource[];
    export let activeId: string | undefined;
    export let onSelect: (source: LiveSource) => void;
    export let onManage: () => void;

    let open = false;
    let button: HTMLButtonElement;
    let position = "";

    $: activeIndex = sources.findIndex((source) => source.id === activeId);

    function toggle() {
        if (!sources.length) {
            onManage();
            return;
        }
        open = !open;
        const rect = button.getBoundingClientRect();
        position = `top:${rect.bottom + 10}px;left:${rect.left}px;`;
    }

    function closeOutside(node: HTMLElement) {
        const close = (event: PointerEvent) => {
            if (!node.contains(event.target as Node) && !button.contains(event.target as Node)) open = false;
        };
        const escape = (event: KeyboardEvent) => event.key === "Escape" && (open = false);
        window.addEventListener("pointerdown", close, true);
        window.addEventListener("keydown", escape);
        return {
            destroy() {
                window.removeEventListener("pointerdown", close, true);
                window.removeEventListener("keydown", escape);
            },
        };
    }
</script>

<button
    bind:this={button}
    class="source-picker flex w-[clamp(56px,4vw,80px)] shrink-0 items-center justify-center bg-[#181818]/50 font-poppins text-[clamp(18px,1.4vw,26px)] font-semibold text-[#C3C3C3] hover:bg-[#262626]/60 cursor-pointer"
    aria-label={sources.length ? "Switch source" : "Add a source"}
    aria-haspopup={sources.length ? "menu" : undefined}
    aria-expanded={open}
    onclick={toggle}
>
    {#if activeIndex >= 0}
        {activeIndex + 1}
    {:else}
        <Plus size={30} strokeWidth={2} />
    {/if}
</button>

{#if open}
    <div
        use:portal
        use:closeOutside
        class="fixed z-[400] flex w-[min(20rem,calc(100vw-24px))] flex-col gap-1 rounded-2xl bg-[#181818] p-2 shadow-[0_20px_60px_rgba(0,0,0,0.45)]"
        style={position}
        transition:fade={{ duration: 120 }}
        role="menu"
        tabindex="-1"
    >
        {#each sources as source, index (source.id)}
            <button
                class="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left font-poppins text-sm cursor-pointer {source.id === activeId
                    ? 'bg-white text-black'
                    : 'text-white/78 hover:bg-white/8 hover:text-white'}"
                onclick={() => {
                    open = false;
                    onSelect(source);
                }}
                role="menuitem"
            >
                <span class="w-4 shrink-0 tabular-nums font-semibold {source.id === activeId ? 'text-black/50' : 'text-white/35'}">{index + 1}</span>
                <span class="truncate">{source.name}</span>
            </button>
        {/each}
        <button
            class="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left font-poppins text-sm text-white/60 hover:bg-white/8 hover:text-white cursor-pointer"
            onclick={() => {
                open = false;
                onManage();
            }}
            role="menuitem"
        >
            <Settings2 size={16} strokeWidth={2} class="shrink-0" />
            Manage sources
        </button>
    </div>
{/if}

<style>
    .source-picker :global(svg) {
        width: clamp(24px, 1.7vw, 32px);
        height: clamp(24px, 1.7vw, 32px);
    }
</style>
