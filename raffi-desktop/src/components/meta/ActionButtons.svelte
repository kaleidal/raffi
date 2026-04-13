<script lang="ts">
    import ListsPopup from "./modals/ListsPopup.svelte";
    import TrailerModal from "./modals/TrailerModal.svelte";
    import { Archive, Film } from "@lucide/svelte";
    import { trackEvent } from "../../lib/analytics";


    export let metaData: any;

    let listsPopupVisible = false;
    let trailerVisible = false;

    const openLists = () => {
        listsPopupVisible = true;
        trackEvent("list_modal_opened", {
            content_type: metaData?.meta?.type ?? null,
        });
    };

    const openTrailer = () => {
        trailerVisible = true;
        trackEvent("trailer_opened", {
            has_trailer: Boolean(metaData?.meta?.trailers?.length),
        });
    };

</script>

<div class="flex flex-row gap-[20px] justify-between w-full">
    <button
        class="px-[40px] py-[20px] flex flex-1 min-w-0 flex-row gap-[16px] items-center cursor-pointer hover:bg-[#D3D3D3]/10 transition-all duration-200 bg-[#FFFFFF]/10 backdrop-blur-[16px] rounded-[64px] justify-center"
        on:click={openLists}
    >

        <Archive
            size={30}
            strokeWidth={2}
            color="white"
            class="shrink-0 min-w-[30px] min-h-[30px]"
        />

        <span class="text-[#E1E1E1] text-[24px] font-poppins font-medium whitespace-nowrap"
            >Add to list</span
        >
    </button>

    <ListsPopup
        bind:visible={listsPopupVisible}
        imdbId={metaData.meta.imdb_id}
        type={metaData.meta.type}
    />

    <button
        class="px-[40px] py-[20px] flex flex-1 min-w-0 flex-row gap-[16px] items-center cursor-pointer hover:bg-[#D3D3D3]/10 transition-all duration-200 bg-[#FFFFFF]/10 backdrop-blur-[16px] rounded-[64px] justify-center"
        on:click={openTrailer}
    >

        <Film size={30} strokeWidth={2} color="white" />

        <span class="text-[#E1E1E1] text-[24px] font-poppins font-medium whitespace-nowrap"
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
