<script lang="ts">
    import { ArchiveX } from "@lucide/svelte";
    import FeatureStrip from "../../../components/common/FeatureStrip.svelte";
    import { isAndroidPlatform } from "../../../lib/shell/platform";
    import { router } from "../../../lib/stores/router";
    import { handleRemoveFromList } from "../listActions";
    import { selectedItem } from "../listsState";

    const item = $derived($selectedItem);
</script>

{#if item}
    <FeatureStrip
        item={{
            key: item.imdb_id,
            name: item.name ?? "",
            logo: item.logo,
            background: item.background,
            description: item.description,
            details: [item.year, item.runtime, item.imdbRating ? `${item.imdbRating} IMDb` : ""].filter(Boolean).join(" · "),
            trailerId: isAndroidPlatform ? undefined : item.trailerStreams?.at(-1)?.ytId,
        }}
        onDetails={() => router.navigate("meta", { imdbId: item.imdb_id, type: item.type })}
    >
        {#snippet actions()}
            <button
                class="cursor-pointer rounded-full p-3 text-ink/55 transition-colors hover:bg-danger/15 hover:text-danger"
                aria-label="Remove from list"
                title="Remove from list"
                onclick={handleRemoveFromList}
            >
                <ArchiveX size={22} strokeWidth={2} />
            </button>
        {/snippet}
    </FeatureStrip>
{:else}
    <section class="list-empty-feature flex w-full shrink-0 flex-col justify-end gap-2 rounded-[clamp(24px,2.2vw,36px)] bg-ink/[0.04] p-[clamp(24px,2.6vw,44px)]">
        <h2 class="text-[clamp(24px,2vw,36px)] font-semibold text-ink">Nothing here yet</h2>
        <p class="text-ink/55">Use Add to list on any title to save it here.</p>
    </section>
{/if}

<style>
    .list-empty-feature {
        height: clamp(260px, 34vh, 420px);
    }
</style>
