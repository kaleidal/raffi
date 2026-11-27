import { get } from "svelte/store";
import {
    metaData, selectedEpisode, currentSeason, selectedStream,
    showTorrentWarning,
    pendingTorrentStream
} from "./metaState";
import { router } from "../../lib/stores/router";
import { fetchStreams, fetchStreamListForEpisodeOnly, playStream } from "./streamLogic";
import type { ProgressMap } from "../../lib/library/types/progress";
import type { Stream } from "../../lib/streams/types";
import type { Episode } from "../../lib/library/types/meta_types";
import {
    allowTorrenting,
    hasAcknowledgedTorrentWarning,
    isTorrentSource,
} from "../../lib/stores/torrenting";

type ResolvedNextEpisode = { stream: Stream; nextEpisode: Episode };

const findBingeMatch = (currentStream: Stream | null, nextStreams: Stream[]): Stream | null => {
    if (!currentStream || nextStreams.length === 0) return null;

    const currentGroup = currentStream.behaviorHints?.bingeGroup;
    const groupMatch = currentGroup
        ? nextStreams.find((s) => s.behaviorHints?.bingeGroup === currentGroup)
        : undefined;

    return groupMatch
        ?? nextStreams.find((s) => {
            if (s.name !== currentStream.name) return false;
            const currentTitle = currentStream.title?.split("\n")[0];
            return currentTitle
                ? s.title?.includes(currentTitle)
                : true;
        })
        ?? nextStreams.find((s) => s.name === currentStream.name)
        ?? null;
};

export const resolveNextEpisodeStream = async (
    imdbID: string,
): Promise<ResolvedNextEpisode | null> => {
    const episode = get(selectedEpisode);
    const data = get(metaData);

    if (!episode || !data || !data.meta.videos) return null;

    const currentIndex = data.meta.videos.findIndex(
        (v) =>
            v.season === episode.season &&
            v.episode === episode.episode,
    );

    if (currentIndex === -1 || currentIndex >= data.meta.videos.length - 1) {
        return null;
    }

    const nextEp = data.meta.videos[currentIndex + 1];
    const nextStreams = await fetchStreamListForEpisodeOnly(nextEp, imdbID);
    const match = findBingeMatch(get(selectedStream), nextStreams);

    if (!match) return null;
    return { stream: match, nextEpisode: nextEp };
};

export const playResolvedNextEpisode = (
    resolved: ResolvedNextEpisode,
    progressMap: ProgressMap,
) => {
    const { stream, nextEpisode } = resolved;
    if (nextEpisode.season !== get(currentSeason)) {
        currentSeason.set(nextEpisode.season);
    }

    const isTorrent = isTorrentSource(stream);

    if (isTorrent && !get(allowTorrenting)) {
        selectedEpisode.set(nextEpisode);
        router.back();
    } else if (isTorrent && !hasAcknowledgedTorrentWarning()) {
        pendingTorrentStream.set(stream);
        showTorrentWarning.set(true);
        selectedEpisode.set(nextEpisode);
        router.back();
    } else {
        selectedEpisode.set(nextEpisode);
        playStream(stream, progressMap, {
            replace: true,
        });
    }
};

export const handleNextEpisode = async (imdbID: string, progressMap: ProgressMap) => {
    const episode = get(selectedEpisode);
    const data = get(metaData);

    if (!episode || !data || !data.meta.videos) return;

    const currentIndex = data.meta.videos.findIndex(
        (v) =>
            v.season === episode.season &&
            v.episode === episode.episode,
    );

    if (currentIndex !== -1 && currentIndex < data.meta.videos.length - 1) {
        const nextEp = data.meta.videos[currentIndex + 1];

        if (nextEp.season !== get(currentSeason)) {
            currentSeason.set(nextEp.season);
        }

        const nextStreams = await fetchStreams(nextEp, true, false, imdbID);
        const match = findBingeMatch(get(selectedStream), nextStreams);

        if (match) {
            playResolvedNextEpisode({ stream: match, nextEpisode: nextEp }, progressMap);
        } else {
            selectedEpisode.set(nextEp);
            router.back();
        }
    } else {
        router.back();
    }
};
