<script lang="ts">
    import { Link2 } from "@lucide/svelte";
    import type { EnrichedStream } from "./types";

    export let item: EnrichedStream;
    export let showPeers = false;
    export let disabled = false;

    export let onClick: () => void = () => {};
</script>

<button
    class="w-full p-5 rounded-2xl flex flex-col gap-3 text-left transition-all duration-200 {disabled
        ? 'bg-ink/10 backdrop-blur-3xl opacity-45 cursor-not-allowed'
        : 'bg-ink/10 backdrop-blur-3xl hover:bg-ink/14 cursor-pointer'}"
    disabled={disabled}
    on:click={() => {
        if (disabled) return;
        onClick();
    }}
>
    <div class="flex flex-row justify-between items-start w-full gap-4">
        <div class="flex flex-col gap-1">
            <span class="text-ink text-lg font-semibold">
                {item.meta.providerLabel}
            </span>

            {#if item.meta.infoLine}
                <span class="text-xs text-ink/45">
                    {item.meta.infoLine}
                </span>
            {/if}

            {#if disabled}
                <span class="text-xs text-danger/80">Bad stream • select another</span>
            {/if}

            {#if showPeers && item.meta.isP2P && item.meta.peerCount != null}
                <span class="flex items-center gap-2 text-xs text-ink/70">
                    <Link2 size={14} color="currentColor" strokeWidth={2} />
                    <span>{item.meta.peerCount} peers online</span>
                </span>
            {/if}
        </div>

        {#if item.meta.statusBadges.length}
            <div class="flex flex-wrap gap-2 justify-end">
                {#each item.meta.statusBadges as badge (badge.label)}
                    <span
                        class={`px-3 py-1 rounded-full text-[11px] font-semibold ${badge.variant ===
                        'accent'
                            ? 'bg-accent text-on-accent'
                            : badge.variant === 'danger'
                                ? 'bg-danger/18 text-danger'
                                : 'bg-ink/12 text-ink/80'}`}
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
                    class={`px-3 py-1 rounded-full text-xs font-medium ${badge.variant ===
                    'accent'
                        ? 'bg-accent text-on-accent'
                        : badge.variant === 'muted'
                            ? 'bg-ink/5 text-ink/50'
                            : 'bg-ink/10 text-ink'}`}
                >
                    {badge.label}
                </span>
            {/each}
        </div>
    {/if}
</button>
