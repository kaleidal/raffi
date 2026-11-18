<script lang="ts">
    import type { EnrichedStream } from "../../../../lib/streams/ranking/types";

    let { item, onClick }: { item: EnrichedStream; onClick: () => void } = $props();

    const details = $derived(
        item.meta.featureBadges
            .map((badge) => badge.label)
            .filter((label) => label !== item.meta.resolutionLabel)
            .join(" · "),
    );
    const notes = $derived(item.meta.statusBadges.filter((badge) => badge.variant !== "accent" || badge.label !== "Cached"));
</script>

<button
    class="grid w-full cursor-pointer grid-cols-[clamp(56px,4.5vw,76px)_minmax(0,1fr)_auto] items-center gap-4 rounded-2xl px-4 py-3.5 text-left transition-colors hover:bg-ink/8 disabled:cursor-not-allowed disabled:opacity-45"
    disabled={item.isFailed}
    onclick={onClick}
>
    <span class="text-[clamp(17px,1.25vw,21px)] font-semibold text-ink tabular-nums">{item.meta.resolutionLabel ?? ""}</span>

    <span class="min-w-0">
        <span class="block truncate font-medium text-ink">{item.meta.providerLabel}</span>
        {#if details}
            <span class="block truncate text-sm text-ink/55">{details}</span>
        {/if}
        {#if item.meta.infoLine}
            <span class="block truncate text-xs text-ink/40">{item.meta.infoLine}</span>
        {/if}
    </span>

    <span class="flex flex-col items-end gap-1 text-xs whitespace-nowrap">
        {#if item.isFailed}
            <span class="text-danger">Didn't play</span>
        {/if}
        {#if item.meta.isCached === true}
            <span class="flex items-center gap-1.5 text-success"><span class="size-1.5 rounded-full bg-current"></span>Cached</span>
        {/if}
        {#each notes as note (note.label)}
            <span class={note.variant === "danger" ? "text-danger" : "text-ink/50"}>{note.label}</span>
        {/each}
        {#if item.meta.isP2P && item.meta.peerCount != null}
            <span class="text-ink/50 tabular-nums">{item.meta.peerCount} peers</span>
        {/if}
    </span>
</button>
