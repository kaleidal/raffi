<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { Link2 } from "lucide-svelte";
    import type { EnrichedStream } from "./types";

    export let item: EnrichedStream;
    export let showPeers = false;
    export let disabled = false;

    const dispatch = createEventDispatcher();
</script>

<button
    class="w-full p-5 rounded-2xl flex flex-col gap-3 text-left transition-all duration-200 {disabled
        ? 'bg-[#141414] opacity-45 cursor-not-allowed'
        : 'bg-[#1A1A1A] hover:bg-[#222] cursor-pointer'}"
    disabled={disabled}
    on:click={() => {
        if (disabled) return;
        dispatch("click");
    }}
>
    <div class="flex flex-row justify-between items-start w-full gap-4">
        <div class="flex flex-col gap-1">
            <span class="text-white text-lg font-semibold">
                {item.meta.providerLabel}
            </span>

            {#if item.meta.infoLine}
                <span class="text-[10px] uppercase tracking-[0.4em] text-white/40">
                    {item.meta.infoLine}
                </span>
            {/if}

            {#if disabled}
                <span class="text-xs text-red-200/80">Bad stream • select another</span>
            {/if}

            {#if showPeers && item.meta.isP2P && item.meta.peerCount != null}
                <span class="flex items-center gap-2 text-xs text-white/70">
                    <Link2 size={14} color="currentColor" strokeWidth={2} />
                    <span>{item.meta.peerCount} peers online</span>
                </span>
            {/if}
        </div>

        {#if item.meta.statusBadges.length}
            <div class="flex flex-wrap gap-2 justify-end">
                {#each item.meta.statusBadges as badge (badge.label)}
                    <span
                        class={`px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide uppercase ${badge.variant ===
                        'accent'
                            ? 'bg-white text-black'
                            : 'border border-white/20 text-white/80'}`}
                    >
                        {badge.label}
                    </span>
                {/each}
            </div>
        {/if}
    </div>

    {#if item.meta.featureBadges.length}
        <div class="flex flex-wrap gap-2">
            {#each item.meta.featureBadges as badge (badge.label)}
                <span
                    class={`px-3 py-1 rounded-full text-xs font-medium tracking-wide ${badge.variant ===
                    'accent'
                        ? 'bg-white text-black'
                        : badge.variant === 'muted'
                            ? 'bg-white/5 text-white/50'
                            : 'bg-white/10 text-white'}`}
                >
                    {badge.label}
                </span>
            {/each}
        </div>
    {/if}
</button>
