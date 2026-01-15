<script lang="ts">
    import { selectedItem, playerState } from "../listsState";
    import { togglePlay, toggleMute, setPlayerIframe } from "../playerLogic";
    import { handleRemoveFromList } from "../listActions";
    import { router } from "../../../lib/stores/router";
    import ExpandingButton from "../../../components/common/ExpandingButton.svelte";
    import { trackEvent } from "../../../lib/analytics";


    let playerIframe: HTMLIFrameElement;

    $: if (playerIframe) {
        setPlayerIframe(playerIframe);
    }
</script>

<div
    class="w-[45%] h-full relative overflow-y-scroll overflow-x-hidden no-scrollbar rounded-[32px]"
>
    {#if $selectedItem}
        <!-- Trailer Video Background -->
        <div class="absolute top-0 left-0 right-0 h-auto z-0 overflow-hidden">
            {#if $selectedItem.trailerStreams && $selectedItem.trailerStreams.length > 0}
                <div class="relative w-full aspect-[16/9] overflow-hidden">
                    <iframe
                        bind:this={playerIframe}
                        frameborder="0"
                        referrerpolicy="strict-origin-when-cross-origin"
                        src={`https://www.youtube-nocookie.com/embed/${$selectedItem.trailerStreams.at(-1).ytId}?controls=0&modestbranding=1&rel=0&autoplay=1&mute=1&loop=1&playlist=${$selectedItem.trailerStreams.at(-1).ytId}&showinfo=0&iv_load_policy=3&disablekb=1&enablejsapi=1&origin=${window.location.origin}`}
                        class="w-full h-full object-cover scale-[1.35]"
                        title="Trailer"
                    ></iframe>
                    <div
                        class="absolute inset-0 bg-gradient-to-t from-[#090909] via-[#090909]/60 to-transparent z-100"
                    ></div>
                </div>
            {:else if $selectedItem.background}
                <img
                    src={$selectedItem.background}
                    alt="Background"
                    class="w-full h-full object-cover"
                />
            {:else}
                <div
                    class="w-full h-full bg-gradient-to-b from-[#1a1a1a] to-[#090909]"
                ></div>
            {/if}
        </div>

        <!-- Content Overlay -->
        <div
            class="relative z-10 flex flex-col justify-between p-[50px] min-h-full pb-[100px] overflow-x-hidden"
        >
            <!-- Top Controls -->
            <div class="flex flex-row gap-[10px] items-start justify-end">
                <ExpandingButton
                    label={$playerState.isPaused ? "Play" : "Pause"}
                    onClick={togglePlay}
                >
                    {#if $playerState.isPaused}
                        <svg
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            ><path
                                d="M5 3L19 12L5 21V3Z"
                                stroke="#E9E9E9"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            /></svg
                        >
                    {:else}
                        <svg
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            ><path
                                d="M19.5833 1H16.75C15.9676 1 15.3333 1.61561 15.3333 2.375V21.625C15.3333 22.3844 15.9676 23 16.75 23H19.5833C20.3657 23 21 22.3844 21 21.625V2.375C21 1.61561 20.3657 1 19.5833 1Z"
                                stroke="#E9E9E9"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            /><path
                                d="M8.25 1H5.41667C4.63426 1 4 1.61561 4 2.375V21.625C4 22.3844 4.63426 23 5.41667 23H8.25C9.0324 23 9.66667 22.3844 9.66667 21.625V2.375C9.66667 1.61561 9.0324 1 8.25 1Z"
                                stroke="#E9E9E9"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            /></svg
                        >
                    {/if}
                </ExpandingButton>

                <ExpandingButton
                    label={$playerState.isMuted ? "Unmute" : "Mute"}
                    onClick={toggleMute}
                >
                    {#if $playerState.isMuted}
                        <svg
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            ><path
                                d="M11 5L6 9H2V15H6L11 19V5Z"
                                stroke="#E9E9E9"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            /><path
                                d="M23 9L17 15"
                                stroke="#E9E9E9"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            /><path
                                d="M17 9L23 15"
                                stroke="#E9E9E9"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            /></svg
                        >
                    {:else}
                        <svg
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            ><path
                                d="M16 9.00003C16.6491 9.86551 17 10.9182 17 12C17 13.0819 16.6491 14.1345 16 15M19.364 18.364C20.1997 17.5283 20.8627 16.5361 21.315 15.4442C21.7673 14.3523 22.0001 13.1819 22.0001 12C22.0001 10.8181 21.7673 9.64779 21.315 8.55585C20.8627 7.46391 20.1997 6.47176 19.364 5.63603M11 4.70203C10.9998 4.56274 10.9583 4.42663 10.8809 4.31088C10.8034 4.19514 10.6934 4.10493 10.5647 4.05166C10.436 3.99838 10.2944 3.98442 10.1577 4.01154C10.0211 4.03866 9.89559 4.10564 9.797 4.20403L6.413 7.58703C6.2824 7.7184 6.12703 7.82256 5.95589 7.89345C5.78475 7.96435 5.60124 8.00057 5.416 8.00003H3C2.73478 8.00003 2.48043 8.10539 2.29289 8.29292C2.10536 8.48046 2 8.73481 2 9.00003V15C2 15.2652 2.10536 15.5196 2.29289 15.7071C2.48043 15.8947 2.73478 16 3 16H5.416C5.60124 15.9995 5.78475 16.0357 5.95589 16.1066C6.12703 16.1775 6.2824 16.2817 6.413 16.413L9.796 19.797C9.8946 19.8958 10.0203 19.9631 10.1572 19.9904C10.2941 20.0177 10.436 20.0037 10.5649 19.9503C10.6939 19.8968 10.804 19.8063 10.8815 19.6902C10.959 19.5741 11.0002 19.4376 11 19.298V4.70203Z"
                                stroke="#E9E9E9"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            /></svg
                        >
                    {/if}
                </ExpandingButton>
            </div>

            <!-- Bottom Content -->
            <div class="flex flex-col gap-[30px]">
                <div class="flex flex-row gap-[20px] w-full items-center">
                    {#if $selectedItem.logo}
                        <img
                            src={$selectedItem.logo}
                            alt={$selectedItem.name}
                            class="w-[350px] object-contain max-h-[180px] self-start"
                        />
                    {:else}
                        <h1
                            class="text-white text-[56px] font-bold font-poppins leading-tight"
                        >
                            {$selectedItem.name}
                        </h1>
                    {/if}

                    <button
                        class="bg-white text-black px-[50px] h-fit py-[20px] rounded-full font-poppins font-bold text-[20px] hover:bg-white/90 transition-colors flex items-center gap-3 cursor-pointer z-10"
                        on:click={() => {
                            trackEvent("list_item_watch_clicked", {
                                content_type: $selectedItem?.type ?? null,
                            });
                            router.navigate("meta", {
                                imdbId: $selectedItem.imdb_id,
                                type: $selectedItem.type,
                            });
                        }}
                    >

                        <svg
                            width="28"
                            height="28"
                            viewBox="0 0 92 92"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            ><path
                                d="M23 11.5L76.6667 46L23 80.5V11.5Z"
                                stroke="black"
                                stroke-width="10"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            /></svg
                        >
                        Watch
                    </button>
                </div>

                <p
                    class="text-white/80 font-poppins text-[18px] leading-relaxed self-center line-clamp-3 max-w-[90%]"
                >
                    {$selectedItem.description || "No description available."}
                </p>

                <div class="flex flex-col gap-[10px]">
                    <div class="flex flex-row gap-[10px] w-full">
                        <div
                            class="px-[50px] py-[30px] w-full bg-[#FFFFFF]/10 backdrop-blur-[16px] rounded-[50px] flex flex-col gap-[20px]"
                        >
                            <div
                                class="flex flex-row gap-[10px] items-center justify-between"
                            >
                                <span
                                    class="text-[#E8E8E8] text-[24px] font-poppins font-medium"
                                >
                                    {$selectedItem.year || "N/A"} • {$selectedItem.runtime ||
                                        $selectedItem.videos?.length ||
                                        "N/A"}
                                </span>

                                <div
                                    class="flex flex-row gap-[10px] items-center"
                                >
                                    {#if $selectedItem.imdbRating}
                                        <span
                                            class="text-[#E8E8E8] text-[24px] font-poppins font-medium"
                                        >
                                            {$selectedItem.imdbRating}
                                        </span>
                                        <img
                                            src="imdb.png"
                                            alt="IMDb"
                                            class="w-[50px] h-[24px] object-contain"
                                        />
                                    {/if}
                                </div>
                            </div>
                        </div>

                        <button
                            class="bg-[#FF4444]/20 hover:bg-[#FF4444]/30 h-full p-[30px] aspect-square items-center justify-center text-[#FF6666] rounded-full font-poppins font-medium text-[16px] transition-colors flex items-center gap-2 cursor-pointer"
                            on:click={handleRemoveFromList}
                            aria-label="Remove from list"
                        >
                            <svg
                                width="36"
                                height="36"
                                viewBox="0 0 59 64"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                                ><path
                                    d="M43.75 34.833C51.7581 34.833 58.25 41.3249 58.25 49.333C58.25 57.3411 51.7581 63.833 43.75 63.833C35.7419 63.833 29.25 57.3411 29.25 49.333C29.25 41.3249 35.7419 34.833 43.75 34.833ZM43.75 38.833C37.951 38.833 33.25 43.534 33.25 49.333C33.25 55.132 37.951 59.833 43.75 59.833C49.549 59.833 54.25 55.132 54.25 49.333C54.25 43.534 49.549 38.833 43.75 38.833ZM44.333 20.667C48.8432 20.667 52.4998 24.3228 52.5 28.833V33.2666C50.6313 32.4945 48.6129 32.0122 46.5 31.875V28.833C46.4998 27.6365 45.5295 26.667 44.333 26.667H8.16699C6.97048 26.667 6.00018 27.6365 6 28.833V49.5C6.00018 50.6965 6.97048 51.667 8.16699 51.667H26.2686C26.3596 53.7743 26.7946 55.7922 27.5176 57.667H8.16699C3.65678 57.667 0.000176798 54.0102 0 49.5V28.833C0.000175494 24.3228 3.65677 20.667 8.16699 20.667H44.333ZM46.0859 44.1689C46.867 43.3879 48.133 43.3879 48.9141 44.1689C49.6951 44.95 49.6951 46.216 48.9141 46.9971L46.5781 49.333L48.9141 51.6689C49.6951 52.45 49.6951 53.716 48.9141 54.4971C48.133 55.2781 46.867 55.2781 46.0859 54.4971L43.75 52.1611L41.4141 54.4971C40.633 55.2781 39.367 55.2781 38.5859 54.4971C37.8049 53.716 37.8049 52.45 38.5859 51.6689L40.9219 49.333L38.5859 46.9971C37.8049 46.216 37.8049 44.95 38.5859 44.1689C39.367 43.3879 40.633 43.3879 41.4141 44.1689L43.75 46.5049L46.0859 44.1689ZM44.333 10.333C45.9898 10.333 47.3328 11.6763 47.333 13.333C47.3328 14.9897 45.9898 16.333 44.333 16.333H8.16699C6.51025 16.333 5.16717 14.9897 5.16699 13.333C5.16717 11.6763 6.51025 10.333 8.16699 10.333H44.333ZM39.167 0C40.8237 0.000176531 42.167 1.34325 42.167 3C42.1668 4.6566 40.8236 5.99982 39.167 6H13.333C11.6764 5.99982 10.3332 4.6566 10.333 3C10.333 1.34325 11.6763 0.000175758 13.333 0H39.167Z"
                                    fill="#FF3B30"
                                /></svg
                            >
                        </button>
                    </div>
                </div>
            </div>
        </div>
    {/if}

</div>

<style>
    .no-scrollbar::-webkit-scrollbar {
        display: none;
    }
    .no-scrollbar {
        -ms-overflow-style: none;
        scrollbar-width: none;
    }
</style>
