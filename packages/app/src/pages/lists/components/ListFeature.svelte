<script lang="ts">
    import { ArchiveX, Info, Pause, Play, Volume2, VolumeX } from "@lucide/svelte";
    import { fade } from "svelte/transition";
    import IconButton from "../../../components/common/controls/IconButton.svelte";
    import { isAndroidPlatform } from "../../../lib/shell/platform";
    import { router } from "../../../lib/stores/router";
    import { handleRemoveFromList } from "../listActions";
    import { playerState, selectedItem } from "../listsState";
    import { setPlayerIframe, toggleMute, togglePlay } from "../playerLogic";

    let playerIframe = $state<HTMLIFrameElement | null>(null);

    const item = $derived($selectedItem);
    const trailerId = $derived(isAndroidPlatform ? "" : (item?.trailerStreams?.at(-1)?.ytId ?? ""));
    const details = $derived(
        [item?.year, item?.runtime, item?.imdbRating ? `${item.imdbRating} IMDb` : ""].filter(Boolean).join(" · "),
    );

    function openDetails() {
        if (item) router.navigate("meta", { imdbId: item.imdb_id, type: item.type });
    }
</script>

<section class="feature scheme-dark relative w-full shrink-0 overflow-hidden rounded-[clamp(24px,2.2vw,36px)] bg-canvas">
    {#if item}
        {#key item.imdb_id}
            <div class="feature-media absolute inset-y-0 right-0 w-[72%] overflow-hidden" in:fade={{ duration: 400 }}>
                {#if trailerId}
                    <iframe
                        bind:this={playerIframe}
                        frameborder="0"
                        referrerpolicy="strict-origin-when-cross-origin"
                        src={`https://www.youtube-nocookie.com/embed/${trailerId}?controls=0&modestbranding=1&rel=0&autoplay=1&mute=1&loop=1&playlist=${trailerId}&showinfo=0&iv_load_policy=3&cc_load_policy=0&disablekb=1&fs=0&playsinline=1&enablejsapi=1&origin=${window.location.origin}`}
                        class="feature-frame pointer-events-none"
                        title="Trailer"
                        onload={() => playerIframe && setPlayerIframe(playerIframe)}
                    ></iframe>
                {:else if item.background}
                    <img src={item.background} alt="" class="h-full w-full object-cover" />
                {/if}
                <div class="absolute inset-0 bg-gradient-to-r from-canvas via-canvas/55 to-transparent"></div>
                <div class="absolute inset-0 bg-gradient-to-t from-canvas/70 via-transparent to-transparent"></div>
            </div>
        {/key}

        <div class="relative z-10 flex h-full max-w-[min(620px,58%)] flex-col justify-end gap-[clamp(10px,1vw,16px)] p-[clamp(24px,2.6vw,44px)]">
            {#if item.logo}
                <img src={item.logo} alt={item.name} class="max-h-[clamp(64px,6.5vw,112px)] max-w-[min(100%,360px)] self-start object-contain object-left" />
            {:else}
                <h2 class="text-[clamp(26px,2.2vw,40px)] leading-tight font-semibold text-ink">{item.name}</h2>
            {/if}

            {#if details}
                <p class="text-sm font-medium text-ink/70">{details}</p>
            {/if}

            {#if item.description}
                <p class="line-clamp-2 text-[clamp(14px,0.9vw,16px)] leading-relaxed text-ink/75">{item.description}</p>
            {/if}

            <div class="flex items-center gap-2.5 pt-1">
                <button
                    class="flex cursor-pointer items-center gap-2.5 rounded-full bg-accent px-6 py-3 font-medium text-on-accent transition-colors hover:bg-accent/85"
                    onclick={openDetails}
                >
                    <Info size={20} strokeWidth={2.5} />
                    Details
                </button>
                {#if trailerId}
                    <IconButton label={$playerState.isPaused ? "Play" : "Pause"} onClick={togglePlay}>
                        {#if $playerState.isPaused}
                            <Play size={22} strokeWidth={2.2} />
                        {:else}
                            <Pause size={22} strokeWidth={2.2} />
                        {/if}
                    </IconButton>
                    <IconButton label={$playerState.isMuted ? "Unmute" : "Mute"} onClick={toggleMute}>
                        {#if $playerState.isMuted}
                            <VolumeX size={22} strokeWidth={2.2} />
                        {:else}
                            <Volume2 size={22} strokeWidth={2.2} />
                        {/if}
                    </IconButton>
                {/if}
                <button
                    class="cursor-pointer rounded-full p-3 text-ink/55 transition-colors hover:bg-danger/15 hover:text-danger"
                    aria-label="Remove from list"
                    title="Remove from list"
                    onclick={handleRemoveFromList}
                >
                    <ArchiveX size={22} strokeWidth={2} />
                </button>
            </div>
        </div>
    {:else}
        <div class="flex h-full flex-col justify-end gap-2 p-[clamp(24px,2.6vw,44px)]">
            <h2 class="text-[clamp(24px,2vw,36px)] font-semibold text-ink">Nothing here yet</h2>
            <p class="text-ink/55">Use Add to list on any title to save it here.</p>
        </div>
    {/if}
</section>

<style>
    .feature {
        height: clamp(260px, 34vh, 420px);
    }

    .feature-frame {
        position: absolute;
        left: 50%;
        top: 50%;
        width: max(100%, 177.78cqh);
        height: max(100%, 56.25cqw);
        border: 0;
        transform: translate(-50%, -50%) scale(1.08);
    }

    .feature-media {
        container-type: size;
    }
</style>
