<script lang="ts">
    import { onMount } from "svelte";
    import { fade } from "svelte/transition";
    import SearchBar from "../../components/home/SearchBar.svelte";
    import AddonsModal from "../../components/home/modals/AddonsModal.svelte";
    import LoadingSpinner from "../../components/common/LoadingSpinner.svelte";

    import ListSidebar from "./components/ListSidebar.svelte";
    import ListPreview from "./components/ListPreview.svelte";
    import ListItemGrid from "./components/ListItemGrid.svelte";

    import { loadLists } from "./dataLoader";
    import { loaded, showAddonsModal, showSettingsModal } from "./listsState";
    import SettingsModal from "../../components/home/modals/SettingsModal.svelte";

    onMount(async () => {
        await loadLists();
        loaded.set(true);
    });
</script>

<AddonsModal bind:showAddonsModal={$showAddonsModal} />
<SettingsModal bind:showSettings={$showSettingsModal} />

<div
    class="bg-[#090909] h-full w-full flex flex-col overflow-hidden overflow-x-hidden items-center"
>
    <SearchBar
        absolute={false}
        on:openAddons={() => ($showAddonsModal = true)}
        on:openSettings={() => ($showSettingsModal = true)}
    />

    {#if $loaded}
        <div
            class="flex flex-row gap-2.5 mt-12.5 items-start justify-center w-full max-w-screen h-[calc(100%-200px)] px-5 z-10 rounded-[20px]"
            in:fade={{ duration: 300 }}
        >
            <ListSidebar>
                <div slot="grid" let:listId>
                    <ListItemGrid {listId} />
                </div>
            </ListSidebar>

            <ListPreview />
        </div>

        <div class="w-full absolute top-0 left-0 overflow-hidden">
            <svg
                viewBox="0 0 1858 591"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                <g filter="url(#filter0_f_222_680)">
                    <ellipse
                        cx="929"
                        cy="95.5"
                        rx="529"
                        ry="95.5"
                        fill="#D9D9D9"
                        fill-opacity="0.6"
                    />
                </g>
                <defs>
                    <filter
                        id="filter0_f_222_680"
                        x="0"
                        y="-400"
                        width="1858"
                        height="991"
                        filterUnits="userSpaceOnUse"
                        color-interpolation-filters="sRGB"
                    >
                        <feFlood
                            flood-opacity="0"
                            result="BackgroundImageFix"
                        />
                        <feBlend
                            mode="normal"
                            in="SourceGraphic"
                            in2="BackgroundImageFix"
                            result="shape"
                        />
                        <feGaussianBlur
                            stdDeviation="200"
                            result="effect1_foregroundBlur_222_680"
                        />
                    </filter>
                </defs>
            </svg>
        </div>
    {:else}
        <div
            class="w-full h-full flex items-center justify-center"
            out:fade={{ duration: 200 }}
        >
            <LoadingSpinner size="60px" />
        </div>
    {/if}
</div>
