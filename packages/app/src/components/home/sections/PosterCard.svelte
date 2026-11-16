<script lang="ts">
    import PosterImage from "./PosterImage.svelte";
    import { router } from "../../../lib/stores/router";
    import { openTitleMenu } from "../../../lib/home/titleMenu";
    import { previewAmbient } from "../../../lib/home/ambient";
    import type { PopularTitleMeta } from "../../../lib/library/types/popular_types";

    let { title, class: className = "" }: { title: PopularTitleMeta; class?: string } = $props();

    const details = $derived(
        [title.year ?? title.releaseInfo, title.imdbRating ? `${title.imdbRating} IMDb` : ""].filter(Boolean).join(" · "),
    );
</script>

<button
    class="poster-card scheme-dark group relative aspect-[2/3] shrink-0 cursor-pointer overflow-clip rounded-[16px] p-0 text-left transition-[translate,box-shadow] duration-300 ease-out hover:-translate-y-1.5 hover:shadow-[0_14px_30px_rgba(0,0,0,0.35)] focus-visible:-translate-y-1.5 {className}"
    aria-label={`Open ${title.name}`}
    onclick={() => router.navigate("meta", { imdbId: title.imdb_id, type: title.type })}
    oncontextmenu={(event) => openTitleMenu(event, title)}
    onpointerenter={() => previewAmbient(title.background || title.poster)}
    onfocus={() => previewAmbient(title.background || title.poster)}
>
    <PosterImage src={title.poster} title={title.name} alt="" />
    <span
        class="pointer-events-none absolute inset-0 flex flex-col justify-end gap-1 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-[clamp(10px,0.9vw,16px)] opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
    >
        <span class="line-clamp-2 text-[clamp(13px,0.9vw,16px)] leading-snug font-semibold text-ink">{title.name}</span>
        {#if details}
            <span class="text-xs text-ink/70">{details}</span>
        {/if}
    </span>
</button>
