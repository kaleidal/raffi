<script lang="ts">
    import type { ShowResponse } from "../../../../lib/library/types/meta_types";
    import type { EpisodeProgressDetails, ReleaseInfo } from "./types";

    let {
        selectedEpisode,
        metaData,
        releaseInfo,
        progressDetails,
    }: {
        selectedEpisode: any;
        metaData: ShowResponse | null;
        releaseInfo: ReleaseInfo;
        progressDetails: EpisodeProgressDetails | null;
    } = $props();

    let failedArtwork = $state<string | null>(null);

    const isEpisode = $derived(metaData?.meta?.type !== "movie" && Number(selectedEpisode?.season) > 0);
    const artwork = $derived(selectedEpisode?.thumbnail || metaData?.meta?.background || metaData?.meta?.poster || null);
    const heading = $derived(
        isEpisode ? selectedEpisode?.name || selectedEpisode?.title || metaData?.meta?.name : metaData?.meta?.name,
    );
    const label = $derived(
        isEpisode ? `S${selectedEpisode.season}E${selectedEpisode.episode ?? selectedEpisode.number}` : (metaData?.meta?.year ?? ""),
    );
    const progressLabel = $derived(
        progressDetails ? (progressDetails.watched ? "Watched" : progressDetails.timeLeftLabel) : (releaseInfo.relative ?? releaseInfo.absolute),
    );
    const details = $derived([label, progressLabel].filter(Boolean).join(" · "));
</script>

<div class="flex min-w-0 items-center gap-4">
    <div class="relative aspect-video w-[clamp(112px,9vw,156px)] shrink-0 overflow-hidden rounded-xl bg-ink/8">
        {#if artwork && failedArtwork !== artwork}
            <img src={artwork} alt="" class="h-full w-full object-cover" onerror={() => (failedArtwork = artwork)} />
        {/if}
        {#if progressDetails && !progressDetails.watched}
            <div class="absolute inset-x-2 bottom-2 h-1 overflow-hidden rounded-full bg-white/25">
                <div class="h-full rounded-full bg-accent" style="width: {progressDetails.percent}%"></div>
            </div>
        {/if}
    </div>
    <div class="min-w-0">
        <h2 class="truncate text-[clamp(20px,1.5vw,26px)] leading-tight font-semibold text-ink">{heading}</h2>
        {#if details}
            <p class="mt-1 text-sm text-ink/55 tabular-nums">{details}</p>
        {/if}
    </div>
</div>
