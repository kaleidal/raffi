<script lang="ts">
    import Slider from "../Slider.svelte";
    import ExpandingButton from "../ExpandingButton.svelte";
    import { slide } from "svelte/transition";

    export let isPlaying = false;
    export let duration = 0;
    export let currentTime = 0;
    export let volume = 1;
    export let controlsVisible = true;
    export let loading = false;
    export let videoSrc: string | null = null;

    export let togglePlay: () => void;
    export let onSeekInput: (e: Event) => void;
    export let onSeekChange: (e: Event) => void;
    export let onVolumeChange: (e: Event) => void;
    export let toggleFullscreen: () => void;

    const formatTime = (t: number) => {
        if (!isFinite(t) || t < 0) return "0:00";
        const hours = Math.floor(t / 3600);
        const minutes = Math.floor((t % 3600) / 60);
        const seconds = Math.floor(t % 60)
            .toString()
            .padStart(2, "0");

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds}`;
        }
        return `${minutes}:${seconds}`;
    };

    // percent *elapsed*
    $: progress = duration > 0 ? (currentTime / duration) * 100 : 0;
</script>

{#if controlsVisible && !loading}
    <div
        in:slide={{ duration: 200, axis: "y" }}
        out:slide={{ duration: 200, axis: "y" }}
        class="z-10 items-center bg-[#000000]/10 backdrop-blur-[24px] rounded-[32px] w-[1000px] flex flex-col gap-2 px-[30px] py-[20px] text-white"
    >
        <div class="flex flex-row gap-[20px] items-center w-full">
            <button
                on:click={togglePlay}
                class="w-[60px] h-[60px] cursor-pointer hover:opacity-80 transition-opacity duration-200"
            >
                {#if isPlaying}
                    <svg
                        width="60"
                        height="60"
                        viewBox="0 0 60 60"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            d="M30 0C37.9565 0 45.5868 3.16102 51.2129 8.78711C56.839 14.4132 60 22.0435 60 30C60 37.9565 56.839 45.5868 51.2129 51.2129C45.5868 56.839 37.9565 60 30 60C22.0435 60 14.4132 56.839 8.78711 51.2129C3.16102 45.5868 0 37.9565 0 30C0 22.0435 3.16102 14.4132 8.78711 8.78711C14.4132 3.16102 22.0435 0 30 0ZM21.3574 17C20.0725 17 19.0002 18.0279 19 19.333V40.667C19.0002 41.9721 20.0725 43 21.3574 43H25.4287C26.7136 42.9999 27.786 41.9721 27.7861 40.667V19.333C27.786 18.0279 26.7136 17.0001 25.4287 17H21.3574ZM33.5713 17C32.2864 17.0001 31.214 18.0279 31.2139 19.333V40.667C31.214 41.9721 32.2864 42.9999 33.5713 43H37.6426C38.9275 43 39.9998 41.9721 40 40.667V19.333C39.9998 18.0279 38.9275 17 37.6426 17H33.5713Z"
                            fill="white"
                        />
                    </svg>
                {:else}
                    <svg
                        width="60"
                        height="60"
                        viewBox="0 0 60 60"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            d="M0 30C0 22.0435 3.16071 14.4129 8.7868 8.7868C14.4129 3.16071 22.0435 0 30 0C37.9565 0 45.5871 3.16071 51.2132 8.7868C56.8393 14.4129 60 22.0435 60 30C60 37.9565 56.8393 45.5871 51.2132 51.2132C45.5871 56.8393 37.9565 60 30 60C22.0435 60 14.4129 56.8393 8.7868 51.2132C3.16071 45.5871 0 37.9565 0 30ZM22.0664 17.2383C21.1758 17.7305 20.625 18.6797 20.625 19.6875V40.3125C20.625 41.332 21.1758 42.2695 22.0664 42.7617C22.957 43.2539 24.0352 43.2422 24.9141 42.7031L41.7891 32.3906C42.6211 31.875 43.1367 30.9727 43.1367 29.9883C43.1367 29.0039 42.6211 28.1016 41.7891 27.5859L24.9141 17.2734C24.0469 16.7461 22.957 16.7227 22.0664 17.2148V17.2383Z"
                            fill="white"
                        />
                    </svg>
                {/if}
            </button>

            <span
                class="text-[22px] font-poppins font-[500] text-[#D3D3D3] text-center"
                >{formatTime(Math.max(0, duration - currentTime))}</span
            >

            <div class="relative flex-grow h-2">
                <Slider
                    widthProgress={100 - progress}
                    widthGrey={progress}
                    onInput={onSeekInput}
                    onChange={onSeekChange}
                    value={duration - currentTime}
                    min={0}
                    max={duration}
                    step={0.1}
                />
            </div>
        </div>

        <div class="flex items-center w-full justify-center gap-4">
            <ExpandingButton
                label={"Fullscreen"}
                onClick={() => {
                    toggleFullscreen();
                }}
            >
                <svg
                    width="22"
                    height="24"
                    viewBox="0 0 20 20"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path
                        d="M6.66667 2.5H4.16667C3.72464 2.5 3.30072 2.67559 2.98816 2.98816C2.67559 3.30072 2.5 3.72464 2.5 4.16667V6.66667M17.5 6.66667V4.16667C17.5 3.72464 17.3244 3.30072 17.0118 2.98816C16.6993 2.67559 16.2754 2.5 15.8333 2.5H13.3333M2.5 13.3333V15.8333C2.5 16.2754 2.67559 16.6993 2.98816 17.0118C3.30072 17.3244 3.72464 17.5 4.16667 17.5H6.66667M13.3333 17.5H15.8333C16.2754 17.5 16.6993 17.3244 17.0118 17.0118C17.3244 16.6993 17.5 16.2754 17.5 15.8333V13.3333"
                        stroke="#E9E9E9"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    />
                </svg>
            </ExpandingButton>

            <ExpandingButton
                label={"Download"}
                onClick={() => {
                    window.open(videoSrc!!);
                }}
            >
                <svg
                    width="22"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path
                        d="M12 15V3M12 15L7 10M12 15L17 10M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15"
                        stroke="#E9E9E9"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    />
                </svg>
            </ExpandingButton>

            <div class="w-[180px]">
                <Slider
                    widthProgress={volume * 100}
                    widthGrey={100}
                    onInput={onVolumeChange}
                    value={volume}
                    label="Volume"
                    min={0}
                    max={1}
                    step={0.01}
                />
            </div>
        </div>
    </div>
{/if}
