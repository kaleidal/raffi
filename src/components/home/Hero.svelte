<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import type { PopularTitleMeta } from "../../lib/library/types/popular_types";
    import { router } from "../../lib/stores/router";
    import ExpandingButton from "../common/ExpandingButton.svelte";

    export let showcasedTitle: PopularTitleMeta;

    const dispatch = createEventDispatcher();

    let playerIframe: HTMLIFrameElement;
    let isPaused = false;
    let isMuted = true;

    function togglePlay() {
        if (!playerIframe) return;
        const command = isPaused ? "playVideo" : "pauseVideo";
        playerIframe.contentWindow?.postMessage(
            JSON.stringify({ event: "command", func: command, args: [] }),
            "*",
        );
        isPaused = !isPaused;
    }

    function toggleMute() {
        if (!playerIframe) return;
        const command = isMuted ? "unMute" : "mute";
        playerIframe.contentWindow?.postMessage(
            JSON.stringify({ event: "command", func: command, args: [] }),
            "*",
        );
        isMuted = !isMuted;
    }

    function navigateToMeta(imdbId: string, type: string) {
        router.navigate("meta", { imdbId, type });
    }
</script>

<div class="w-screen h-[80vh] relative overflow-hidden">
    <div
        class="absolute bottom-[100px] left-[100px] z-10 flex flex-col gap-[50px]"
    >
        <img
            src={showcasedTitle.logo ?? ""}
            alt="Logo"
            class="w-[600px] h-fit"
            on:error={() => dispatch("logoError")}
        />

        <div class="flex flex-row gap-[10px] items-center">
            <button
                class="bg-[#FFFFFF]/80 hover:bg-[#D3D3D3]/80 cursor-pointer backdrop-blur-2xl flex flex-row items-center justify-center gap-[20px] text-black text-[36px] font-poppins font-medium px-[100px] py-[20px] w-fit rounded-full transition-colors duration-200"
                on:click={() =>
                    navigateToMeta(showcasedTitle.imdb_id, showcasedTitle.type)}
            >
                <svg
                    width="48"
                    height="48"
                    viewBox="0 0 36 36"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path
                        d="M18 24V18M18 12H18.015M33 18C33 26.2843 26.2843 33 18 33C9.71573 33 3 26.2843 3 18C3 9.71573 9.71573 3 18 3C26.2843 3 33 9.71573 33 18Z"
                        stroke="black"
                        stroke-width="4"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    />
                </svg>

                Details
            </button>

            <ExpandingButton
                label={isPaused ? "Play" : "Pause"}
                onClick={togglePlay}
            >
                {#if isPaused}
                    <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            d="M5 3L19 12L5 21V3Z"
                            stroke="#E9E9E9"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        />
                    </svg>
                {:else}
                    <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            d="M19.5833 1H16.75C15.9676 1 15.3333 1.61561 15.3333 2.375V21.625C15.3333 22.3844 15.9676 23 16.75 23H19.5833C20.3657 23 21 22.3844 21 21.625V2.375C21 1.61561 20.3657 1 19.5833 1Z"
                            stroke="#E9E9E9"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        />
                        <path
                            d="M8.25 1H5.41667C4.63426 1 4 1.61561 4 2.375V21.625C4 22.3844 4.63426 23 5.41667 23H8.25C9.0324 23 9.66667 22.3844 9.66667 21.625V2.375C9.66667 1.61561 9.0324 1 8.25 1Z"
                            stroke="#E9E9E9"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        />
                    </svg>
                {/if}
            </ExpandingButton>

            <ExpandingButton
                label={isMuted ? "Unmute" : "Mute"}
                onClick={toggleMute}
            >
                {#if isMuted}
                    <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            d="M11 5L6 9H2V15H6L11 19V5Z"
                            stroke="#E9E9E9"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        />
                        <path
                            d="M23 9L17 15"
                            stroke="#E9E9E9"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        />
                        <path
                            d="M17 9L23 15"
                            stroke="#E9E9E9"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        />
                    </svg>
                {:else}
                    <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            d="M16 9.00003C16.6491 9.86551 17 10.9182 17 12C17 13.0819 16.6491 14.1345 16 15M19.364 18.364C20.1997 17.5283 20.8627 16.5361 21.315 15.4442C21.7673 14.3523 22.0001 13.1819 22.0001 12C22.0001 10.8181 21.7673 9.64779 21.315 8.55585C20.8627 7.46391 20.1997 6.47176 19.364 5.63603M11 4.70203C10.9998 4.56274 10.9583 4.42663 10.8809 4.31088C10.8034 4.19514 10.6934 4.10493 10.5647 4.05166C10.436 3.99838 10.2944 3.98442 10.1577 4.01154C10.0211 4.03866 9.89559 4.10564 9.797 4.20403L6.413 7.58703C6.2824 7.7184 6.12703 7.82256 5.95589 7.89345C5.78475 7.96435 5.60124 8.00057 5.416 8.00003H3C2.73478 8.00003 2.48043 8.10539 2.29289 8.29292C2.10536 8.48046 2 8.73481 2 9.00003V15C2 15.2652 2.10536 15.5196 2.29289 15.7071C2.48043 15.8947 2.73478 16 3 16H5.416C5.60124 15.9995 5.78475 16.0357 5.95589 16.1066C6.12703 16.1775 6.2824 16.2817 6.413 16.413L9.796 19.797C9.8946 19.8958 10.0203 19.9631 10.1572 19.9904C10.2941 20.0177 10.436 20.0037 10.5649 19.9503C10.6939 19.8968 10.804 19.8063 10.8815 19.6902C10.959 19.5741 11.0002 19.4376 11 19.298V4.70203Z"
                            stroke="#E9E9E9"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        />
                    </svg>
                {/if}
            </ExpandingButton>
        </div>
    </div>

    <div
        class="absolute inset-0 w-full h-full scale-[1.35] pointer-events-none"
    >
        <iframe
            bind:this={playerIframe}
            frameborder="0"
            referrerpolicy="strict-origin-when-cross-origin"
            src={`https://www.youtube-nocookie.com/embed/${showcasedTitle.trailerStreams!.at(-1)!.ytId}?controls=0&modestbranding=1&rel=0&autoplay=1&mute=1&loop=1&playlist=${showcasedTitle.trailerStreams!.at(-1)!.ytId}&showinfo=0&iv_load_policy=3&disablekb=1&enablejsapi=1`}
            class="w-full h-full object-cover"
            title="Trailer"
        ></iframe>
    </div>
    <div
        class="absolute inset-0 bg-gradient-to-t from-[#090909] via-transparent to-transparent"
    ></div>
    <div
        class="absolute inset-0 bg-gradient-to-r from-[#090909]/80 via-transparent to-transparent"
    ></div>
</div>
