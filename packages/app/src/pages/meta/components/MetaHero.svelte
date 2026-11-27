<script lang="ts">
    import ActionButtons from "../../../components/meta/ActionButtons.svelte";
    import UpNextCard from "../../../components/meta/UpNextCard.svelte";
    import MetaInfo from "./MetaInfo.svelte";
    import MovieWatchButton from "./MovieWatchButton.svelte";
    import TitleLogo from "../../../components/common/TitleLogo.svelte";
    import { getSeriesResumeEpisode, getStandardEpisodes } from "../episodeSelection";
    import { getProgress } from "../progressLogic";
    import type { ShowResponse } from "../../../lib/library/types/meta_types";
    import type { LastWatched } from "../types";
    import type { ProgressMap } from "../../../lib/library/types/progress";

    let {
        metaData,
        progressMap,
        lastWatched,
        seasons,
        logoFailed,
        starting,
        onLogoError,
        onPlay,
        onChooseSource,
    }: {
        metaData: ShowResponse;
        progressMap: ProgressMap;
        lastWatched: LastWatched;
        seasons: number;
        logoFailed: boolean;
        starting: boolean;
        onLogoError: () => void;
        onPlay: (episode: { season: number; episode: number }) => void;
        onChooseSource: (episode: { season: number; episode: number }) => void;
    } = $props();

    const meta = $derived(metaData.meta);
    const isSeries = $derived(meta.type === "series");
    const progressKey = (season: number, episode: number) => `${season}:${episode}`;

    const upNext = $derived(
        isSeries
            ? getSeriesResumeEpisode(
                  meta.videos,
                  lastWatched,
                  getProgress(progressMap, progressKey(lastWatched.season, lastWatched.episode)),
              )
            : null,
    );
    const standardEpisodes = $derived(isSeries ? getStandardEpisodes(meta.videos) : []);
    const seriesProgress = $derived(
        standardEpisodes.length
            ? standardEpisodes.filter((video) => getProgress(progressMap, progressKey(video.season, video.episode))?.watched)
                  .length / standardEpisodes.length
            : null,
    );
    const playTarget = $derived(upNext ?? { season: 0, episode: 0 });
</script>

<div class="flex w-full flex-col items-start justify-start gap-2.5">
    <TitleLogo logo={logoFailed ? null : meta.logo} name={meta.name} progress={seriesProgress} {onLogoError} />
    <MetaInfo {metaData} {seasons} />
    {#if isSeries}
        <div class="mt-1 flex items-center gap-3">
            <ActionButtons {metaData} onChooseSource={() => onChooseSource(playTarget)} />
        </div>
    {/if}
</div>

{#if isSeries}
    {#if upNext}
        <UpNextCard
            episode={upNext}
            progress={getProgress(progressMap, progressKey(upNext.season, upNext.episode))}
            {starting}
            onPlay={() => onPlay(playTarget)}
        />
    {/if}
{:else}
    <div class="flex items-center gap-3">
        <MovieWatchButton progress={getProgress(progressMap)} {starting} onPlay={() => onPlay(playTarget)} />
        <ActionButtons {metaData} onChooseSource={() => onChooseSource(playTarget)} />
    </div>
{/if}
