import type { LastWatched, ProgressItem } from "./types";

type EpisodeLike = {
    season?: number;
    episode?: number;
};

const isStandardEpisode = (episode: EpisodeLike | null | undefined) =>
    Number(episode?.season) > 0 && Number(episode?.episode) > 0;

const compareEpisodes = (left: EpisodeLike, right: EpisodeLike) => {
    const seasonDiff = Number(left.season || 0) - Number(right.season || 0);
    if (seasonDiff !== 0) return seasonDiff;
    return Number(left.episode || 0) - Number(right.episode || 0);
};

export const getStandardEpisodes = <T extends EpisodeLike>(videos: T[] | null | undefined): T[] => {
    if (!Array.isArray(videos)) return [];
    return videos.filter(isStandardEpisode).slice().sort(compareEpisodes);
};

export const getFirstStandardEpisode = <T extends EpisodeLike>(videos: T[] | null | undefined): T | null => {
    const standardEpisodes = getStandardEpisodes(videos);
    return standardEpisodes[0] ?? null;
};

export const getSeriesResumeEpisode = <T extends EpisodeLike>(
    videos: T[] | null | undefined,
    lastWatched: LastWatched,
    lastEpisodeProgress?: ProgressItem,
): T | null => {
    const standardEpisodes = getStandardEpisodes(videos);
    if (standardEpisodes.length === 0) return null;

    const currentIndex = standardEpisodes.findIndex(
        (episode) =>
            Number(episode.season) === Number(lastWatched.season)
            && Number(episode.episode) === Number(lastWatched.episode),
    );

    if (currentIndex === -1) {
        return standardEpisodes[0];
    }

    if (lastEpisodeProgress && !lastEpisodeProgress.watched && lastEpisodeProgress.time > 0) {
        return standardEpisodes[currentIndex];
    }

    return standardEpisodes[Math.min(currentIndex + 1, standardEpisodes.length - 1)]
        ?? standardEpisodes[currentIndex];
};