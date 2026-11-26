<script lang="ts">
    import { tick } from "svelte";
    import { fade } from "svelte/transition";
    import { ChevronDown } from "@lucide/svelte";
    import { portal } from "../../../components/common/portal";
    import { matchKey } from "../../../lib/live/parse/text";

    let {
        groups,
        value,
        counts,
        onChange,
    }: {
        groups: string[];
        value: string;
        counts: Map<string, number>;
        onChange: (group: string) => void;
    } = $props();

    let open = $state(false);
    let query = $state("");
    let button: HTMLButtonElement;
    let input = $state.raw<HTMLInputElement>();
    let position = $state("");

    const needle = $derived(matchKey(query));
    const shown = $derived(needle ? groups.filter((group) => matchKey(group).includes(needle)) : groups);

    async function toggle() {
        open = !open;
        if (!open) return;
        query = "";
        const rect = button.getBoundingClientRect();
        position = `top:${rect.bottom + 8}px;left:${rect.left}px;`;
        await tick();
        input?.focus();
    }

    function choose(group: string) {
        open = false;
        onChange(group);
    }

    function onKeydown(event: KeyboardEvent) {
        if (event.key === "Escape") open = false;
        if (event.key === "Enter" && shown.length) choose(shown[0]);
    }

    function closeOutside(node: HTMLElement) {
        const close = (event: PointerEvent) => {
            if (!node.contains(event.target as Node) && !button.contains(event.target as Node)) open = false;
        };
        window.addEventListener("pointerdown", close, true);
        return { destroy: () => window.removeEventListener("pointerdown", close, true) };
    }
</script>

<button
    bind:this={button}
    class="flex min-w-0 items-center gap-2 rounded-full bg-ink/[0.07] px-5 py-2.5 text-[0.95rem] font-medium text-ink/85 hover:bg-ink/[0.12] cursor-pointer"
    onclick={toggle}
    aria-haspopup="listbox"
    aria-expanded={open}
>
    <span class="truncate">{value}</span>
    <ChevronDown size={16} strokeWidth={2.2} class="shrink-0 transition-transform duration-200 {open ? 'rotate-180' : ''}" />
</button>

{#if open}
    <div
        use:portal
        use:closeOutside
        class="fixed z-[400] flex max-h-[min(30rem,70vh)] w-[min(22rem,calc(100vw-24px))] flex-col gap-1 rounded-2xl bg-surface p-2 shadow-[0_20px_60px_rgba(0,0,0,0.45)]"
        style={position}
        transition:fade={{ duration: 120 }}
        role="listbox"
        tabindex="-1"
        onkeydown={onKeydown}
    >
        <input
            bind:this={input}
            bind:value={query}
            type="text"
            placeholder="Filter groups"
            class="mb-1 w-full rounded-xl bg-ink/[0.06] px-3 py-2 text-sm text-ink placeholder:text-ink/35 outline-none"
        />
        <div class="min-h-0 overflow-y-auto no-scrollbar">
            {#each shown as group (group)}
                <button
                    class="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm cursor-pointer {group === value
                        ? 'bg-accent text-on-accent'
                        : 'text-ink/78 hover:bg-ink/8 hover:text-ink'}"
                    onclick={() => choose(group)}
                    role="option"
                    aria-selected={group === value}
                >
                    <span class="truncate">{group}</span>
                    {#if counts.has(group)}
                        <span class="shrink-0 tabular-nums {group === value ? 'text-canvas/45' : 'text-ink/30'}">{counts.get(group)}</span>
                    {/if}
                </button>
            {:else}
                <p class="px-3 py-2 text-sm text-ink/40">No groups match.</p>
            {/each}
        </div>
    </div>
{/if}
