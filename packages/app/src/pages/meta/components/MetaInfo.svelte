<script lang="ts">
    import type { ShowResponse } from "../../../lib/library/types/meta_types";

    let { metaData, seasons }: { metaData: ShowResponse; seasons: number } = $props();

    const meta = $derived(metaData.meta);
    const facts = $derived(
        [
            meta.releaseInfo || meta.year,
            meta.type === "series" && seasons > 0 ? `${seasons} ${seasons === 1 ? "season" : "seasons"}` : meta.runtime,
            meta.genre?.slice(0, 3).join(", "),
        ].filter(Boolean),
    );
</script>

<div class="flex w-full flex-col items-start gap-[clamp(12px,1vw,18px)]">
    {#if meta.description}
        <p class="max-w-[720px] text-[clamp(14px,1vw,18px)] leading-relaxed text-ink/80">{meta.description}</p>
    {/if}
    <p class="flex flex-wrap items-center gap-x-2 text-[clamp(14px,0.95vw,17px)] font-medium text-ink/65">
        {facts.join(" · ")}
        {#if meta.imdbRating}
            {#if facts.length}<span aria-hidden="true">·</span>{/if}
            <a
                href={`https://www.imdb.com/title/${meta.imdb_id}`}
                target="_blank"
                rel="noopener noreferrer"
                class="text-ink/80 underline-offset-4 hover:text-ink hover:underline"
            >
                {meta.imdbRating} IMDb
            </a>
        {/if}
    </p>
</div>
