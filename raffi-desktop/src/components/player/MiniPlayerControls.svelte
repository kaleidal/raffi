<script lang="ts">
    export let currentTime = 0;
    export let duration = 0;
    export let pendingSeek: number | null = null;
    export let loading = false;
    export let isPlaying = false;
    export let seekBarStyle: "raffi" | "normal" = "raffi";
    export let onSeekInput: (event: Event) => void;
    export let onSeekChange: (event: Event) => void;
    export let onTogglePlayback: () => void;

    let hovering = false;

    $: displayedTime = pendingSeek ?? currentTime;
    $: progress = duration > 0 ? (displayedTime / duration) * 100 : 0;
    $: sliderValue =
        seekBarStyle === "normal"
            ? displayedTime
            : duration > 0
              ? duration - displayedTime
              : 0;
    $: progressWidth = `${Math.max(
        0,
        Math.min(100, seekBarStyle === "normal" ? progress : 100 - progress),
    )}%`;
    $: greyWidth = `${Math.max(
        0,
        Math.min(100, seekBarStyle === "normal" ? 100 - progress : progress),
    )}%`;
</script>

<div
    class="absolute inset-0 z-40"
    role="presentation"
    style="-webkit-app-region: drag"
    on:mouseenter={() => {
        hovering = true;
    }}
    on:mouseleave={() => {
        hovering = false;
    }}
>
    <div
        class={`absolute inset-0 bg-linear-to-t from-black/70 via-black/15 to-transparent transition-opacity duration-200 ${hovering ? "opacity-100" : "opacity-45"}`}
    ></div>

    {#if loading}
        <div class="absolute inset-0 flex items-center justify-center">
            <div class="h-10 w-10 rounded-full border-2 border-white/20 border-t-white/85 animate-spin"></div>
        </div>
    {/if}

    <div class="absolute inset-0 flex items-center justify-center">
        <button
            class={`mini-player-action pointer-events-auto h-15 w-15 cursor-pointer transition-all duration-200 ${hovering ? "opacity-100 scale-100" : "opacity-0 scale-90 pointer-events-none"}`}
            on:click|stopPropagation={onTogglePlayback}
            aria-label={isPlaying ? "Pause playback" : "Resume playback"}
            type="button"
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
    </div>

    <div class="pointer-events-auto absolute inset-x-0 bottom-0 px-3 pb-3">
        <div class="relative h-5 rounded-full">
            <div class="absolute inset-x-0 bottom-1 h-1 rounded-full bg-[#A3A3A3]/30"></div>
            <div
                class="absolute bottom-1 h-1 rounded-full bg-white transition-[width] duration-150"
                style={`left:0;right:auto;width:${progressWidth};`}
            ></div>
            <div
                class="absolute bottom-1 h-1 rounded-full bg-[#A3A3A3]/30 transition-[width] duration-150"
                style={`right:0;left:auto;width:${greyWidth};`}
            ></div>
            <input
                class="mini-player-action absolute inset-x-0 bottom-0 h-5 w-full cursor-pointer appearance-none bg-transparent"
                type="range"
                min={0}
                max={duration}
                step={0.1}
                value={sliderValue}
                on:click|stopPropagation
                on:input={onSeekInput}
                on:change={onSeekChange}
                aria-label="Seek mini player"
            />
        </div>
    </div>
</div>

<style>
    .mini-player-action {
        -webkit-app-region: no-drag;
    }

    input[type="range"]::-webkit-slider-thumb {
        appearance: none;
        width: 0;
        height: 0;
    }

    input[type="range"]::-moz-range-thumb {
        width: 0;
        height: 0;
        border: 0;
    }

    input[type="range"]::-ms-thumb {
        width: 0;
        height: 0;
        border: 0;
    }
</style>