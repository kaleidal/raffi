<script lang="ts">
    import type { Snippet } from "svelte";
    import { Check } from "@lucide/svelte";

    let {
        label,
        detail = "",
        selected = false,
        nested = false,
        stacked = false,
        expanded,
        trailing,
        onclick,
    }: {
        label: string;
        detail?: string;
        selected?: boolean;
        nested?: boolean;
        /** Puts the detail under the label, for details too long to share a line. */
        stacked?: boolean;
        expanded?: boolean;
        trailing?: Snippet;
        onclick: () => void;
    } = $props();
</script>

<button
    class="track-row flex w-full cursor-pointer items-center gap-3 rounded-[14px] py-2.5 pr-3 text-left transition-colors hover:bg-ink/8 focus-visible:bg-ink/12 focus-visible:outline-none {selected
        ? 'text-ink'
        : 'text-ink/72'} {nested ? 'pl-10' : 'pl-3'}"
    aria-pressed={selected}
    aria-expanded={expanded}
    data-tv-autofocus={selected || undefined}
    {onclick}
>
    <span class="flex size-[18px] shrink-0 items-center justify-center">
        {#if selected}
            <Check size={18} strokeWidth={2.5} />
        {/if}
    </span>
    {#if stacked}
        <span class="flex min-w-0 flex-1 flex-col">
            <span class="truncate font-medium">{label}</span>
            {#if detail}
                <span class="truncate text-[0.85em] text-ink/45">{detail}</span>
            {/if}
        </span>
    {:else}
        <span class="min-w-0 flex-1 truncate font-medium">{label}</span>
        {#if detail}
            <span class="max-w-[55%] shrink-0 truncate text-[0.85em] text-ink/45">{detail}</span>
        {/if}
    {/if}
    {@render trailing?.()}
</button>

<style>
    .track-row {
        font-size: clamp(14px, 0.95vw, 16px);
    }
</style>
