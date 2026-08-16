<script lang="ts">
    import { ArchiveX, Info, Pause, Play, Volume2, VolumeX } from "@lucide/svelte";
    import ExpandingButton from "../../../components/common/ExpandingButton.svelte";
    import { trackEvent } from "../../../lib/analytics";
    import { router } from "../../../lib/stores/router";
    import { handleRemoveFromList } from "../listActions";
    import { playerState, selectedItem } from "../listsState";
    import { setPlayerIframe, toggleMute, togglePlay } from "../playerLogic";

    let playerIframe: HTMLIFrameElement;
    $: trailerId = $selectedItem?.trailerStreams?.at(-1)?.ytId ?? "";

    function syncTrailerState() {
        if (playerIframe) setPlayerIframe(playerIframe);
    }

    function watchSelectedItem() {
        if (!$selectedItem) return;
        trackEvent("list_item_watch_clicked", {
            content_type: $selectedItem.type ?? null,
        });
        router.navigate("meta", {
            imdbId: $selectedItem.imdb_id,
            type: $selectedItem.type,
        });
    }
</script>

<div class="list-preview h-full w-full min-h-0 min-w-0 overflow-hidden rounded-[clamp(22px,2vw,32px)] bg-[#111]">
    {#if $selectedItem}
        <div class="preview-layout h-full min-h-0">
            <div class="preview-media relative min-h-0 overflow-hidden bg-[#151515]">
                {#if trailerId}
                    <iframe
                        bind:this={playerIframe}
                        frameborder="0"
                        referrerpolicy="strict-origin-when-cross-origin"
                        src={`https://www.youtube-nocookie.com/embed/${trailerId}?controls=0&modestbranding=1&rel=0&autoplay=1&mute=1&loop=1&playlist=${trailerId}&showinfo=0&iv_load_policy=3&disablekb=1&fs=0&playsinline=1&enablejsapi=1&origin=${window.location.origin}`}
                        class="preview-frame pointer-events-none"
                        title="Trailer"
                        on:load={syncTrailerState}
                    ></iframe>
                {:else if $selectedItem.background}
                    <img
                        src={$selectedItem.background}
                        alt=""
                        class="h-full w-full object-cover"
                    />
                {:else}
                    <div class="h-full w-full bg-gradient-to-b from-[#242424] to-[#111]"></div>
                {/if}

                <div class="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#111] via-transparent to-black/10"></div>

                {#if trailerId}
                    <div class="absolute right-[clamp(14px,1.4vw,22px)] top-[clamp(14px,1.4vw,22px)] z-10 flex gap-2">
                        <ExpandingButton
                            label={$playerState.isPaused ? "Play" : "Pause"}
                            onClick={togglePlay}
                        >
                            {#if $playerState.isPaused}
                                <Play size={22} strokeWidth={2.2} />
                            {:else}
                                <Pause size={22} strokeWidth={2.2} />
                            {/if}
                        </ExpandingButton>

                        <ExpandingButton
                            label={$playerState.isMuted ? "Unmute" : "Mute"}
                            onClick={toggleMute}
                        >
                            {#if $playerState.isMuted}
                                <VolumeX size={22} strokeWidth={2.2} />
                            {:else}
                                <Volume2 size={22} strokeWidth={2.2} />
                            {/if}
                        </ExpandingButton>
                    </div>
                {/if}
            </div>

            <div class="preview-body relative flex min-h-0 flex-col px-[clamp(20px,2vw,32px)] pb-[clamp(20px,2vw,30px)] pt-[clamp(62px,5.6vw,88px)]">
                <div class="preview-heading absolute inset-x-[clamp(20px,2vw,32px)] top-0 flex items-center justify-between gap-5">
                    {#if $selectedItem.logo}
                        <img
                            src={$selectedItem.logo}
                            alt={$selectedItem.name}
                            class="max-h-[clamp(92px,8vw,132px)] min-w-0 max-w-[min(58%,310px)] object-contain object-left"
                        />
                    {:else}
                        <h1 class="max-w-[62%] font-poppins text-[clamp(25px,2vw,38px)] font-bold leading-tight text-white">
                            {$selectedItem.name}
                        </h1>
                    {/if}

                    <button
                        class="details-button flex shrink-0 cursor-pointer items-center gap-2.5 rounded-full bg-white/80 px-[clamp(22px,1.8vw,32px)] py-[clamp(11px,0.9vw,14px)] font-poppins text-[clamp(14px,0.95vw,17px)] font-medium text-black backdrop-blur-2xl transition-colors hover:bg-[#d3d3d3]/80"
                        on:click={watchSelectedItem}
                    >
                        <Info size={22} strokeWidth={3} />
                        Details
                    </button>
                </div>

                <p class="mt-[clamp(6px,0.7vw,12px)] line-clamp-3 font-poppins text-[clamp(13px,0.88vw,16px)] leading-relaxed text-white/78">
                    {$selectedItem.description || "No description available."}
                </p>

                <div class="mt-auto flex w-full items-stretch gap-[10px] pt-[clamp(14px,1.3vw,20px)]">
                    <div class="flex min-w-0 flex-1 items-center justify-between gap-5 rounded-[clamp(20px,1.7vw,28px)] bg-white/10 px-[clamp(20px,1.7vw,28px)] py-[clamp(15px,1.2vw,19px)] backdrop-blur-[16px]">
                        <span class="truncate font-poppins text-[clamp(14px,0.95vw,17px)] font-medium text-[#e8e8e8]">
                            {$selectedItem.year || "N/A"} · {$selectedItem.runtime || $selectedItem.videos?.length || "N/A"}
                        </span>

                        {#if $selectedItem.imdbRating}
                            <div class="flex shrink-0 items-center gap-2.5">
                                <span class="font-poppins text-[clamp(14px,0.95vw,17px)] font-medium text-[#e8e8e8]">
                                    {$selectedItem.imdbRating}
                                </span>
                                <img src="imdb.png" alt="IMDb" class="h-[22px] w-[46px] object-contain" />
                            </div>
                        {/if}
                    </div>

                    <button
                        class="flex aspect-square shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#ff4444]/20 p-[clamp(15px,1.2vw,19px)] text-[#ff4b43] transition-colors hover:bg-[#ff4444]/30"
                        on:click={handleRemoveFromList}
                        aria-label="Remove from list"
                    >
                        <ArchiveX size={28} strokeWidth={2.2} />
                    </button>
                </div>
            </div>
        </div>
    {/if}
</div>

<style>
    .preview-layout {
        display: grid;
        grid-template-rows: minmax(230px, 52%) minmax(0, 48%);
    }

    .preview-frame {
        position: absolute;
        left: 50%;
        top: 50%;
        width: 100%;
        height: 100%;
        border: 0;
        transform: translate(-50%, -50%) scale(1.08);
    }

    .preview-heading {
        transform: translateY(-50%);
    }

    .preview-heading img,
    .preview-heading h1 {
        filter: drop-shadow(0 8px 20px rgb(0 0 0 / 0.45));
    }

    @media (max-height: 760px) and (orientation: landscape) {
        .preview-layout {
            grid-template-rows: minmax(210px, 50%) minmax(0, 50%);
        }

    }
</style>
