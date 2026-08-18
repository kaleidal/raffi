<script lang="ts">
    import ListsPopup from "./modals/ListsPopup.svelte";
    import TrailerModal from "./modals/TrailerModal.svelte";
    import { Archive, Film } from "@lucide/svelte";


    export let metaData: any;

    let listsPopupVisible = false;
    let trailerVisible = false;

    const openLists = () => {
        listsPopupVisible = true;
    };

    const openTrailer = () => {
        trailerVisible = true;
    };

</script>

<div class="flex flex-row gap-[clamp(12px,1vw,18px)] justify-between w-full">
    <button
        class="action-button px-[clamp(22px,2vw,36px)] py-[clamp(14px,1.1vw,18px)] flex flex-1 min-w-0 flex-row gap-[clamp(10px,0.8vw,14px)] items-center cursor-pointer hover:bg-[#D3D3D3]/10 transition-all duration-200 bg-[#FFFFFF]/10 backdrop-blur-[16px] rounded-full justify-center"
        on:click={openLists}
    >

        <Archive
            size={30}
            strokeWidth={2}
            color="white"
            class="shrink-0 min-w-[30px] min-h-[30px]"
        />

        <span class="text-[#E1E1E1] text-[clamp(17px,1.2vw,22px)] font-poppins font-medium whitespace-nowrap"
            >Add to list</span
        >
    </button>

    <ListsPopup
        bind:visible={listsPopupVisible}
        imdbId={metaData.meta.imdb_id}
        type={metaData.meta.type}
    />

    <button
        class="action-button px-[clamp(22px,2vw,36px)] py-[clamp(14px,1.1vw,18px)] flex flex-1 min-w-0 flex-row gap-[clamp(10px,0.8vw,14px)] items-center cursor-pointer hover:bg-[#D3D3D3]/10 transition-all duration-200 bg-[#FFFFFF]/10 backdrop-blur-[16px] rounded-full justify-center"
        on:click={openTrailer}
    >

        <Film size={30} strokeWidth={2} color="white" />

        <span class="text-[#E1E1E1] text-[clamp(17px,1.2vw,22px)] font-poppins font-medium whitespace-nowrap"
            >Trailer</span
        >
    </button>

    {#if metaData.meta.trailers && metaData.meta.trailers.length > 0}
        <TrailerModal
            bind:visible={trailerVisible}
            ytId={metaData.meta.trailers[0].source}
        />
    {/if}
</div>

<style>
    .action-button :global(svg) {
        width: clamp(22px, 1.5vw, 28px);
        height: clamp(22px, 1.5vw, 28px);
        min-width: 0;
        min-height: 0;
    }
</style>
