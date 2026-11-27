<script lang="ts">
    import type { ImportResultSummary } from "./importStatus";

    let { summary }: { summary: ImportResultSummary } = $props();
</script>

<div class="rounded-2xl bg-success/12 text-success px-4 py-3 text-sm flex flex-col gap-1">
    <p>
        {summary.total}
        {summary.movies && !summary.series
            ? (summary.movies === 1 ? "movie" : "movies")
            : summary.series && !summary.movies
                ? (summary.series === 1 ? "show" : "shows")
                : `item${summary.total === 1 ? "" : "s"}`}
        imported
    </p>
    <p class="text-success/80 text-xs">
        {summary.added} new · {summary.merged} updated · {summary.skipped} unchanged
        {#if summary.addonsAdded > 0}
            · {summary.addonsAdded} addon{summary.addonsAdded === 1 ? "" : "s"} added
        {/if}
        {#if summary.rawCount > summary.total}
            · {summary.rawCount} entries in Stremio
        {/if}
    </p>
</div>
