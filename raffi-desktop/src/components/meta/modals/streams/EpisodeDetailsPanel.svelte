<script lang="ts">
    import type { ShowResponse } from "../../../../lib/library/types/meta_types";
    import type { EpisodeProgressDetails, ReleaseInfo } from "./types";

    export let selectedEpisode: any = null;
    export let metaData: ShowResponse | null = null;
    export let releaseInfo: ReleaseInfo = { absolute: null, relative: null };
    export let progressDetails: EpisodeProgressDetails | null = null;

    let thumbnailError = false;
    let lastThumbnail: string | null = null;

    $: episodeTitle =
        selectedEpisode?.name || selectedEpisode?.title || metaData?.meta?.name || "Episode details";

    $: episodeDescription =
        selectedEpisode?.overview || selectedEpisode?.description || metaData?.meta?.description || "";

    $: episodeSeasonNumber = selectedEpisode ? `${selectedEpisode.season ?? "?"}` : null;
    $: episodeNumber = selectedEpisode
        ? `${selectedEpisode.episode ?? selectedEpisode.number ?? "?"}`
        : null;

    $: showEpisodeLabel =
        metaData?.meta?.type !== "movie" && episodeSeasonNumber && episodeNumber;

    $: detailsThumbnail =
        selectedEpisode?.thumbnail ||
        metaData?.meta?.background ||
        metaData?.meta?.poster ||
        null;

    $: if (detailsThumbnail !== lastThumbnail) {
        thumbnailError = false;
        lastThumbnail = detailsThumbnail ?? null;
    }
</script>

<aside
    class="bg-[#1A1A1A] rounded-[28px] p-5 lg:p-6 flex flex-col gap-4 lg:w-[320px] xl:w-90 shrink-0 max-h-full overflow-y-auto"
>
    {#if selectedEpisode}
        <div class="flex flex-col gap-4">
            <div
                class="relative w-full aspect-video rounded-2xl overflow-hidden border border-white/5 bg-[#0f0f0f]"
            >
                {#if detailsThumbnail && !thumbnailError}
                    <img
                        src={detailsThumbnail}
                        alt="Episode artwork"
                        class="w-full h-full object-cover"
                        on:error={() => (thumbnailError = true)}
                    />
                {:else}
                    <div class="w-full h-full flex items-center justify-center text-white/40 text-sm">
                        No artwork available
                    </div>
                {/if}

                {#if progressDetails}
                    <div
                        class="absolute bottom-0 left-0 w-full p-3 bg-linear-to-t from-black/80 via-black/40 to-transparent flex flex-col gap-1.5 z-10"
                    >
                        <div class="flex items-center justify-between text-[10px] uppercase tracking-[0.35em] text-white/70">
                            <span>Resume</span>
                            <span>{progressDetails.timeLeftLabel}</span>
                        </div>
                        <div class="h-1.5 bg-white/20 rounded-full overflow-hidden">
                            <div
                                class="h-full bg-white rounded-full"
                                style={`width: ${progressDetails.percent}%`}
                            ></div>
                        </div>
                    </div>
                {/if}
            </div>

            <div class="flex flex-col gap-3">
                {#if showEpisodeLabel}
                    <span class="text-xs uppercase tracking-[0.2em] text-white/50">
                        Season {episodeSeasonNumber} / Episode {episodeNumber}
                    </span>
                {/if}
                <h3 class="text-white text-2xl font-semibold leading-tight">{episodeTitle}</h3>
                {#if episodeDescription}
                    <p class="text-white/70 text-sm leading-relaxed">{episodeDescription}</p>
                {/if}
            </div>
        </div>

        {#if releaseInfo.absolute}
            <div class="pt-4 border-t border-white/5 flex flex-col gap-1">
                <span class="text-[11px] uppercase tracking-[0.2em] text-white/40">Released</span>
                <span class="text-white text-sm">
                    {releaseInfo.absolute}
                    {#if releaseInfo.relative}
                        <span class="text-white/50">({releaseInfo.relative})</span>
                    {/if}
                </span>
            </div>
        {/if}
    {:else}
        <div class="flex flex-col items-center justify-center text-center text-white/60 text-sm h-full">
            Select an episode to view details.
        </div>
    {/if}
</aside>
