<script lang="ts">
    import Slider from "../common/Slider.svelte";
    import ExpandingButton from "../common/ExpandingButton.svelte";
    import { slide } from "svelte/transition";
    import type { ShowResponse } from "../../lib/library/types/meta_types";
    import { createEventDispatcher } from "svelte";
    import ClipPanel from "./ClipPanel.svelte";
    import { formatTime } from "../../lib/time";
    import { CirclePause, CirclePlay, Maximize, ZoomIn, ZoomOut, AudioWaveform, Subtitles, Users, SkipForward, Download, Scissors, Cast } from "lucide-svelte";

    export let isPlaying = false;
    export let duration = 0;
    export let currentTime = 0;
    export let volume = 1;
    export let controlsVisible = true;
    export let loading = false;
    export let videoSrc: string | null = null;
    export let metaData: ShowResponse | null = null;
    export let sessionId: string;
    export let currentAudioLabel: string = "";
    export let currentSubtitleLabel: string = "";
    export let objectFit: "contain" | "cover" = "contain";
    export let pendingSeek: number | null = null;
    export let isWatchPartyMember = false;
    export let hasNextEpisode = true;
    export let castActive = false;
    export let castBusy = false;
    export let castDeviceName: string = "";

    export let seekBarStyle: "raffi" | "normal" = "raffi";

    export let togglePlay: () => void;
    export let onSeekInput: (e: Event) => void;
    export let onSeekChange: (e: Event) => void;
    export let onVolumeChange: (e: Event) => void;
    export let toggleFullscreen: () => void;
    export let toggleObjectFit: () => void;
    export let onNextEpisode: () => void;

    const dispatch = createEventDispatcher();

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

    let showClipPanel = false;

    let seekHoverVisible = false;
    let seekHoverLeftPct = 0;
    let seekHoverTime = 0;

    const updateSeekHover = (event: MouseEvent) => {
        if (!duration || duration <= 0) return;
        const el = event.currentTarget as HTMLElement | null;
        if (!el) return;

        const rect = el.getBoundingClientRect();
        const raw = (event.clientX - rect.left) / rect.width;
        const ratio = Math.max(0, Math.min(1, raw));

        const timeAtCursor = ratio * duration;
        const desiredGlobal =
            seekBarStyle === "normal" ? timeAtCursor : duration - timeAtCursor;

        seekHoverVisible = true;
        seekHoverLeftPct = ratio * 100;
        seekHoverTime = Math.max(0, Math.min(duration, desiredGlobal));
    };

    const hideSeekHover = () => {
        seekHoverVisible = false;
    };

    const setClipPanelOpen = (open: boolean) => {
        showClipPanel = open;
        dispatch("clipPanelOpenChange", { open });
    };
</script>

{#if controlsVisible && !loading}
    <div
        in:slide={{ duration: 200, axis: "y" }}
        out:slide={{ duration: 200, axis: "y" }}
        class="z-10 items-center bg-[#000000]/10 backdrop-blur-xl rounded-4xl w-250 flex flex-col gap-2 px-7.5 py-5 text-white"
    >
        <div class="flex flex-row gap-5 items-center w-full">
            {#if !isWatchPartyMember}
                <button
                    on:click={togglePlay}
                    class="w-15 h-15 cursor-pointer hover:opacity-80 transition-opacity duration-200"
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
                class="text-[22px] font-poppins font-medium text-[#D3D3D3] text-center"
                style={`min-width:${timeLabelWidth}; display:inline-block; font-variant-numeric: tabular-nums; font-feature-settings:'tnum';`}
                >{formatTime(
                    seekBarStyle === "normal" ? displayedTime : remainingTime,
                )}</span
            >

            <div
                class="relative grow h-2 {isWatchPartyMember
                    ? 'pointer-events-none'
                    : ''}"
                role="presentation"
                on:mouseenter={(e) => updateSeekHover(e as unknown as MouseEvent)}
                on:mousemove={(e) => updateSeekHover(e as unknown as MouseEvent)}
                on:mouseleave={hideSeekHover}
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

                {#if seekHoverVisible && duration > 0}
                    <div
                        class="absolute -top-9 z-10 pointer-events-none"
                        style={`left: ${seekHoverLeftPct}%; transform: translateX(-50%);`}
                    >
                        <div
                            class="bg-[#000000]/60 backdrop-blur-md text-white text-[12px] px-2 py-1 rounded-md"
                            style="font-variant-numeric: tabular-nums; font-feature-settings:'tnum';"
                        >
                            {formatTime(seekHoverTime)}
                        </div>
                    </div>
                {/if}
            </div>            
            {#if seekBarStyle === "normal"}
                <span
                    class="text-[22px] font-poppins font-medium text-[#D3D3D3] text-center"
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
                <Maximize size={22} color="#E9E9E9" strokeWidth={2} />
            </ExpandingButton>

            <ExpandingButton
                label={objectFit === "contain" ? "Zoom" : "Fit"}
                onClick={toggleObjectFit}
            >
                {#if objectFit === "contain"}
                    <ZoomIn size={20} color="#E9E9E9" strokeWidth={2} />
                {:else}
                    <ZoomOut size={20} color="#E9E9E9" strokeWidth={2} />
                {/if}
            </ExpandingButton>

            {#if !isWatchPartyMember}
                <ExpandingButton
                    label={currentAudioLabel || "Audio"}
                    onClick={() => dispatch("audioClick")}
                >
                    <AudioWaveform size={20} color="#E9E9E9" strokeWidth={2} />
                </ExpandingButton>
            {/if}

            <ExpandingButton
                label={castBusy
                    ? "Casting..."
                    : castActive
                      ? `Casting: ${castDeviceName || "Connected"}`
                      : "Cast"}
                onClick={() => {
                    if (castBusy) return;
                    dispatch("castClick");
                }}
            >
                <Cast size={20} color="#E9E9E9" strokeWidth={2} />
            </ExpandingButton>

            <ExpandingButton
                label={currentSubtitleLabel || "Subtitles: Off"}
                onClick={() => dispatch("subtitleClick")}
            >
                <Subtitles size={20} color="#E9E9E9" strokeWidth={2} />
            </ExpandingButton>

            {#if metaData}
                <ExpandingButton
                    label={"Watch Party"}
                    onClick={() => dispatch("watchPartyClick")}
                >
                    <Users size={20} color="#E9E9E9" strokeWidth={2} />
                </ExpandingButton>
            {/if}

            {#if metaData?.meta.type === "series" && onNextEpisode && !isWatchPartyMember && hasNextEpisode}
                <ExpandingButton label={"Next Episode"} onClick={onNextEpisode}>
                    <SkipForward size={20} color="#E9E9E9" strokeWidth={2} />
                </ExpandingButton>
            {/if}

            {#if metaData}
            <ExpandingButton
                label={"Download"}
                onClick={() => {
                    window.open(videoSrc!!);
                }}
            >
                <Download size={22} color="#E9E9E9" strokeWidth={2} />
            </ExpandingButton>
            {/if}

            {#if !isWatchPartyMember}
                <ExpandingButton
                    label={"Clip"}
                    onClick={() => setClipPanelOpen(!showClipPanel)}
                >
                    <Scissors size={20} color="#E9E9E9" strokeWidth={2} />
                </ExpandingButton>
            {/if}

            <div class="w-45">
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

        <ClipPanel
            open={showClipPanel}
            {sessionId}
            {duration}
            currentTime={displayedTime}
            inverted={seekBarStyle !== "normal"}
            {isWatchPartyMember}
            on:close={() => setClipPanelOpen(false)}
        />
    </div>
{/if}
