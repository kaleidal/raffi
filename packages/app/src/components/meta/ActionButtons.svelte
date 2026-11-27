<script lang="ts">
    import { Film, ListPlus, ListVideo } from "@lucide/svelte";
    import IconButton from "../common/controls/IconButton.svelte";
    import ListsPopup from "./modals/ListsPopup.svelte";
    import TrailerModal from "./modals/TrailerModal.svelte";
    import type { ShowResponse } from "../../lib/library/types/meta_types";
    import { getPrimaryTrailerId } from "../../lib/home/trailers";

    let { metaData, onChooseSource }: { metaData: ShowResponse; onChooseSource: () => void } = $props();

    let listsPopupVisible = $state(false);
    let trailerVisible = $state(false);

    const trailerId = $derived(getPrimaryTrailerId(metaData.meta));
</script>

<IconButton label="Choose source" onClick={onChooseSource}>
    <ListVideo size={22} strokeWidth={2} />
</IconButton>

<IconButton label="Add to list" onClick={() => (listsPopupVisible = true)}>
    <ListPlus size={24} strokeWidth={2} />
</IconButton>

{#if trailerId}
    <IconButton label="Trailer" onClick={() => (trailerVisible = true)}>
        <Film size={22} strokeWidth={2} />
    </IconButton>
    <TrailerModal bind:visible={trailerVisible} ytId={trailerId} />
{/if}

<ListsPopup bind:visible={listsPopupVisible} imdbId={metaData.meta.imdb_id} type={metaData.meta.type} />
