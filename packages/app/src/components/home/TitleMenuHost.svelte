<script lang="ts">
    import TitleContextMenu from "./context_menus/TitleContextMenu.svelte";
    import ListsPopup from "../meta/modals/ListsPopup.svelte";
    import TrailerModal from "../meta/modals/TrailerModal.svelte";
    import { titleMenu, type TitleMenuTarget } from "../../lib/home/titleMenu";

    let target = $state<TitleMenuTarget | null>(null);
    let showLists = $state(false);
    let showTrailer = $state(false);

    $effect(() => {
        if ($titleMenu) target = $titleMenu;
    });
</script>

{#if $titleMenu}
    <TitleContextMenu
        x={$titleMenu.x}
        y={$titleMenu.y}
        showTrailer={Boolean($titleMenu.trailerId)}
        onClose={() => titleMenu.set(null)}
        onAddToList={() => (showLists = true)}
        onViewTrailer={() => (showTrailer = true)}
    />
{/if}

{#if target}
    <ListsPopup bind:visible={showLists} imdbId={target.imdbId} type={target.type} />
    {#if target.trailerId}
        <TrailerModal bind:visible={showTrailer} ytId={target.trailerId} />
    {/if}
{/if}
