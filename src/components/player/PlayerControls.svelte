<script lang="ts">
    import Slider from "../common/Slider.svelte";
    import ExpandingButton from "../common/ExpandingButton.svelte";
    import { slide } from "svelte/transition";
    import type { ShowResponse } from "../../lib/library/types/meta_types";
    import { createEventDispatcher, onMount } from "svelte";

    export let isPlaying = false;
    export let duration = 0;
    export let currentTime = 0;
    export let volume = 1;
    export let controlsVisible = true;
    export let loading = false;
    export let videoSrc: string | null = null;
    export let metaData: ShowResponse | null = null;
    export let currentAudioLabel: string = "";
    export let currentSubtitleLabel: string = "";
    export let objectFit: "contain" | "cover" = "contain";
    export let pendingSeek: number | null = null;
    export let isWatchPartyMember = false;

    export let togglePlay: () => void;
    export let onSeekInput: (e: Event) => void;
    export let onSeekChange: (e: Event) => void;
    export let onVolumeChange: (e: Event) => void;
    export let toggleFullscreen: () => void;
    export let toggleObjectFit: () => void;
    export let onNextEpisode: () => void;

    const dispatch = createEventDispatcher();

    let seekBarStyle = "raffi";

    onMount(() => {
        const storedSeek = localStorage.getItem("seek_bar_style");
        seekBarStyle = storedSeek || "raffi";
    });

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

    $: displayedTime = pendingSeek ?? currentTime;
    $: remainingTime = Math.max(0, duration - displayedTime);
    $: progress = duration > 0 ? (displayedTime / duration) * 100 : 0;
    $: sliderValue =
        seekBarStyle === "normal"
            ? displayedTime
            : duration > 0
              ? duration - displayedTime
              : 0;
    $: hasHourFormat = duration >= 3600;
    $: timeLabelWidth = hasHourFormat ? "6ch" : "4ch";
</script>

{#if controlsVisible && !loading}
    <div
        in:slide={{ duration: 200, axis: "y" }}
        out:slide={{ duration: 200, axis: "y" }}
        class="z-10 items-center bg-[#000000]/10 backdrop-blur-[24px] rounded-[32px] w-[1000px] flex flex-col gap-2 px-[30px] py-[20px] text-white"
    >
        <div class="flex flex-row gap-[20px] items-center w-full">
            {#if !isWatchPartyMember}
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
            {/if}

            <span
                class="text-[22px] font-poppins font-[500] text-[#D3D3D3] text-center"
                style={`min-width:${timeLabelWidth}; display:inline-block; font-variant-numeric: tabular-nums; font-feature-settings:'tnum';`}
                >{formatTime(
                    seekBarStyle === "normal" ? displayedTime : remainingTime,
                )}</span
            >

            <div
                class="relative flex-grow h-2 {isWatchPartyMember
                    ? 'pointer-events-none'
                    : ''}"
            >
                <Slider
                    widthProgress={seekBarStyle === "normal"
                        ? progress
                        : 100 - progress}
                    widthGrey={seekBarStyle === "normal"
                        ? 100 - progress
                        : progress}
                    onInput={onSeekInput}
                    onChange={onSeekChange}
                    value={sliderValue}
                    min={0}
                    max={duration}
                    step={0.1}
                />
            </div>            
            {#if seekBarStyle === "normal"}
                <span
                    class="text-[22px] font-poppins font-[500] text-[#D3D3D3] text-center"
                    style={`min-width:${timeLabelWidth}; display:inline-block; font-variant-numeric: tabular-nums; font-feature-settings:'tnum';`}
                    >{formatTime(duration)}</span
                >
            {/if}
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
                label={objectFit === "contain" ? "Zoom" : "Fit"}
                onClick={toggleObjectFit}
            >
                {#if objectFit === "contain"}
                    <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            d="M15 3H21M21 3V9M21 3L14 10M9 21H3M3 21V15M3 21L10 14"
                            stroke="#E9E9E9"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        />
                    </svg>
                {:else}
                    <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            d="M4 14L10 20M10 20H4M10 20V14M20 10L14 4M14 4H20M14 4V10"
                            stroke="#E9E9E9"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        />
                    </svg>
                {/if}
            </ExpandingButton>

            {#if !isWatchPartyMember}
                <ExpandingButton
                    label={currentAudioLabel || "Audio"}
                    onClick={() => dispatch("audioClick")}
                >
                    <svg
                        width="20"
                        height="20"
                        viewBox="0 0 20 20"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            d="M1.6665 8.33333V10.8333M4.99984 5V14.1667M8.33317 2.5V17.5M11.6665 6.66667V12.5M14.9998 4.16667V15M18.3332 8.33333V10.8333"
                            stroke="#E9E9E9"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        />
                    </svg>
                </ExpandingButton>
            {/if}

            <ExpandingButton
                label={currentSubtitleLabel || "Subtitles: Off"}
                onClick={() => dispatch("subtitleClick")}
            >
                <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path
                        d="M5.83333 12.5H9.16667M12.5 12.5H14.1667M5.83333 9.16666H7.5M10.8333 9.16666H14.1667M4.16667 4.16666H15.8333C16.7538 4.16666 17.5 4.91285 17.5 5.83332V14.1667C17.5 15.0871 16.7538 15.8333 15.8333 15.8333H4.16667C3.24619 15.8333 2.5 15.0871 2.5 14.1667V5.83332C2.5 4.91285 3.24619 4.16666 4.16667 4.16666Z"
                        stroke="#E9E9E9"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    />
                </svg>
            </ExpandingButton>

            {#if metaData}
                <ExpandingButton
                    label={"Watch Party"}
                    onClick={() => dispatch("watchPartyClick")}
                >
                    <svg
                        width="19"
                        height="17"
                        viewBox="0 0 19 17"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            d="M12.6667 16V14.3333C12.6667 13.4493 12.3155 12.6014 11.6904 11.9763C11.0652 11.3512 10.2174 11 9.33333 11H4.33333C3.44928 11 2.60143 11.3512 1.97631 11.9763C1.35119 12.6014 1 13.4493 1 14.3333V16M12.6667 1.10667C13.3815 1.29197 14.0145 1.70939 14.4664 2.29339C14.9183 2.87738 15.1635 3.59491 15.1635 4.33333C15.1635 5.07176 14.9183 5.78928 14.4664 6.37328C14.0145 6.95728 13.3815 7.37469 12.6667 7.56M17.6667 16V14.3333C17.6661 13.5948 17.4203 12.8773 16.9678 12.2936C16.5153 11.7099 15.8818 11.293 15.1667 11.1083M10.1667 4.33333C10.1667 6.17428 8.67428 7.66667 6.83333 7.66667C4.99238 7.66667 3.5 6.17428 3.5 4.33333C3.5 2.49238 4.99238 1 6.83333 1C8.67428 1 10.1667 2.49238 10.1667 4.33333Z"
                            stroke="#E9E9E9"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        />
                    </svg>
                </ExpandingButton>
            {/if}

            {#if metaData?.meta.type === "series" && onNextEpisode && !isWatchPartyMember}
                <ExpandingButton label={"Next Episode"} onClick={onNextEpisode}>
                    <svg
                        width="20"
                        height="20"
                        viewBox="0 0 20 20"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            d="M17.5 3.33333V16.6667M5.02417 3.57083C4.77126 3.41908 4.48261 3.33717 4.18769 3.33345C3.89278 3.32972 3.60216 3.40433 3.3455 3.54965C3.08884 3.69497 2.87534 3.90579 2.7268 4.16059C2.57826 4.4154 2.5 4.70506 2.5 5V15C2.5 15.2949 2.57826 15.5846 2.7268 15.8394C2.87534 16.0942 3.08884 16.305 3.3455 16.4503C3.60216 16.5957 3.89278 16.6703 4.18769 16.6665C4.48261 16.6628 4.77126 16.5809 5.02417 16.4292L13.355 11.4308C13.6023 11.2831 13.8071 11.0737 13.9494 10.8232C14.0917 10.5727 14.1666 10.2896 14.1668 10.0015C14.1671 9.71345 14.0927 9.43022 13.9508 9.17947C13.809 8.92872 13.6045 8.71902 13.3575 8.57083L5.02417 3.57083Z"
                            stroke="#E9E9E9"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        />
                    </svg>
                </ExpandingButton>
            {/if}

            {#if metaData}
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
            {/if}

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
