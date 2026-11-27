import { get } from "svelte/store";
import {
    loadingStreams, streams, streamsPopupVisible, selectedEpisode,
    selectedAddon, metaData,
    selectedStream, showTorrentWarning, pendingTorrentStream,
    streamFailureMessage,
    progressMap,
    streamsToReopen,
    failedStreamKeys,
    startingPlayback,
} from "./metaState";
import { router } from "../../lib/stores/router";
import { buildEnrichedStreams } from "../../components/meta/modals/streams/streamFilters";
import { pickBestStream, rankingContext } from "../../lib/streams/ranking/streamRanking";
import { withAvailabilityHint } from "../../lib/streams/ranking/streamSelection";

import type { EpisodeRef } from "./types";

import type { ProgressMap } from "../../lib/library/types/progress";

import type { Stream } from "../../lib/streams/types";
import type { ShowResponse } from "../../lib/library/types/meta_types";
import { getLocalStreamsFor } from "../../lib/library/localLibrary";
import * as ProgressLogic from "./progressLogic";
import { createDirectStream } from "../../lib/streams/directLinks";
import { getStreamingSourceSettings } from "../../lib/streams/sourceSettings";
import {
    clearStreamFailureMessage,
    isStreamFailed,
    markStreamFailed,
} from "./streamFailures";
import {
    acknowledgeTorrentWarning,
    allowTorrenting,
    hasAcknowledgedTorrentWarning,
    isTorrentSource,
} from "../../lib/stores/torrenting";

interface AddonStreamResponse {
    streams?: Stream[];
}

let streamFetchGeneration = 0;
let shownStreamsKey = "";

const streamsKey = (episode: EpisodeRef) => `${get(selectedAddon)}|${episode?.season}:${episode?.episode}`;

const isStaleStreamFetch = (requestId: number) => requestId !== streamFetchGeneration;

const hideDisabledTorrentSources = (items: Stream[]) =>
    get(allowTorrenting) ? items : items.filter((stream) => !isTorrentSource(stream));

const localStreamsFor = (imdbID: string, type: string, episode: EpisodeRef): Stream[] =>
    getLocalStreamsFor(imdbID, type === "series" ? "series" : "movie", episode);

const fetchAddonStreams = async (addonUrl: string, type: string, streamId: string): Promise<Stream[]> => {
    const response = await fetch(
        addonUrl + "/stream/" + type + "/" + streamId + ".json",
    );
    if (!response.ok) {
        throw new Error(`Stream addon returned ${response.status}`);
    }
    const result: AddonStreamResponse = await response.json();
    return Array.isArray(result.streams) ? result.streams : [];
};

const getStartTimeForCurrentSelection = (progressMap: ProgressMap, data: ShowResponse, episode: EpisodeRef) => {
    if (data?.meta?.type === "movie") {
        const prog = ProgressLogic.getProgress(progressMap);
        return prog && !prog.watched ? prog.time || 0 : 0;
    }

    if (!episode) return 0;
    const key = `${episode.season}:${episode.episode}`;
    const prog = ProgressLogic.getProgress(progressMap, key);
    return prog && !prog.watched ? prog.time || 0 : 0;
};

export const fetchStreams = async (
    episode: EpisodeRef,
    silent: boolean = false,
    setActive: boolean = true,
    imdbID: string,
): Promise<Stream[]> => {
    const requestId = ++streamFetchGeneration;
    shownStreamsKey = streamsKey(episode);
    if (!silent) startingPlayback.set(false);
    loadingStreams.set(true);
    streams.set([]);

    if (setActive) {
        selectedEpisode.set(episode);
    }

    try {
        const data = get(metaData);
        if (!data) return [];

        const type = data.meta.type;
        const settings = await getStreamingSourceSettings();
        if (isStaleStreamFetch(requestId)) return [];

        if (settings.mode === "direct") {
            const localStreams = localStreamsFor(imdbID, type, episode);
            const currentProgressMap = get(progressMap);
            const directStream = createDirectStream(settings.direct, {
                metaData: data,
                imdbId: imdbID,
                episode,
                progressSeconds: getStartTimeForCurrentSelection(currentProgressMap, data, episode),
            });
            const combined = [...localStreams, ...(directStream ? [directStream] : [])];
            if (isStaleStreamFetch(requestId)) return [];
            streams.set(combined);

            if (directStream && !silent) {
                playStream(directStream, currentProgressMap);
            } else if (!silent) {
                streamFailureMessage.set("Direct link is not configured for this title.");
                streamsPopupVisible.set(true);
            }

            return combined;
        }

        if (!silent) {
            streamsPopupVisible.set(true);
        }

        let streamId = imdbID;
        if (type === "series") {
            streamId += `:${episode.season}:${episode.episode}`;
        }

        const addonUrl = get(selectedAddon);
        const localStreams = localStreamsFor(imdbID, type, episode);
        if (!addonUrl) {
            streams.set(localStreams);
            clearStreamFailureMessage();
            return localStreams;
        }
        const addonStreams = await fetchAddonStreams(addonUrl, type, streamId);
        if (isStaleStreamFetch(requestId)) return [];

        const remoteStreams = hideDisabledTorrentSources(addonStreams);

        const combined = [...localStreams, ...remoteStreams];
        streams.set(combined);
        return combined;

    } catch (e) {
        if (isStaleStreamFetch(requestId)) return [];
        console.error("Failed to fetch streams", e);
        const data = get(metaData);
        const type = data?.meta?.type || "movie";
        const localStreams = localStreamsFor(imdbID, type, episode);
        streams.set(localStreams);
        return localStreams;
    } finally {
        if (!isStaleStreamFetch(requestId)) {
            loadingStreams.set(false);
        }
    }
};

export const streamToPlayableUrl = (stream: Stream): { url: string; fileIdx: number | null } | null => {
    if (!get(allowTorrenting) && isTorrentSource(stream)) return null;
    if (!stream.url && !stream.infoHash) return null;
    let url = stream.url;
    const fileIdx = stream.infoHash ? (stream.fileIdx ?? null) : null;
    if (stream.infoHash) {
        url = `magnet:?xt=urn:btih:${stream.infoHash}`;
    }
    return url ? { url, fileIdx } : null;
};

export const fetchStreamListForEpisodeOnly = async (episode: EpisodeRef, imdbID: string): Promise<Stream[]> => {
    const data = get(metaData);
    if (!data) return [];

    const type = data.meta.type;
    const settings = await getStreamingSourceSettings();
    if (settings.mode === "direct") {
        const localStreams = localStreamsFor(imdbID, type, episode);
        const directStream = createDirectStream(settings.direct, {
            metaData: data,
            imdbId: imdbID,
            episode,
            progressSeconds: 0,
        });
        return [...localStreams, ...(directStream ? [directStream] : [])];
    }

    let streamId = imdbID;
    if (type === "series") {
        streamId += `:${episode.season}:${episode.episode}`;
    }

    const addonUrl = get(selectedAddon);
    const localStreams = localStreamsFor(imdbID, type, episode);
    if (!addonUrl) return localStreams;
    try {
        const remoteStreams = hideDisabledTorrentSources(await fetchAddonStreams(addonUrl, type, streamId));
        return [...localStreams, ...remoteStreams];
    } catch (e) {
        console.error("fetchStreamListForEpisodeOnly failed", e);
        return localStreams;
    }
};


/** Called by the player before it closes, so the title page opens on the streams of what was playing. */
export const reopenStreamsOnReturn = (imdbId: string | null) => {
    const episode = get(selectedEpisode);
    if (imdbId && episode) streamsToReopen.set({ imdbId, episode });
};

export const episodeClicked = async (episode: EpisodeRef, imdbID: string) => {
    await fetchStreams(episode, false, true, imdbID);
};

export const refreshStreamsForAddon = (episode: EpisodeRef, imdbID: string) => {
    if (streamsKey(episode) !== shownStreamsKey) void fetchStreams(episode, false, false, imdbID);
};

export const playBestStream = async (episode: EpisodeRef, imdbID: string) => {
    const settings = await getStreamingSourceSettings();
    if (settings.mode === "direct") return episodeClicked(episode, imdbID);

    const generation = streamFetchGeneration + 1;
    startingPlayback.set(true);
    const candidates = await fetchStreams(episode, true, true, imdbID);
    if (generation !== streamFetchGeneration) return;
    startingPlayback.set(false);

    const best = pickBestStream(buildEnrichedStreams(candidates, get(failedStreamKeys)), rankingContext());
    if (best) onStreamClick(withAvailabilityHint(best), get(progressMap));
    else streamsPopupVisible.set(true);
};

export const playStream = (
    stream: Stream,
    progressMap: ProgressMap,
    options?: { replace?: boolean },
) => {
    let url = stream.url;
    const fileIdx = stream.infoHash ? (stream.fileIdx ?? null) : null;

    if (stream.infoHash) {
        url = `magnet:?xt=urn:btih:${stream.infoHash}`;
    }

    if (isTorrentSource(stream) && !get(allowTorrenting)) {
        streamFailureMessage.set("Torrenting is disabled. Turn on Allow Torrenting in Settings to play this source.");
        return;
    }

    if (url) {
        clearStreamFailureMessage();
        selectedStream.set(stream);
        const data = get(metaData);
        const episode = get(selectedEpisode);
        let startTime = 0;

        if (data?.meta?.type === "movie") {
            const prog = ProgressLogic.getProgress(progressMap);
            if (prog && !prog.watched) {
                startTime = prog.time || 0;
            }
        } else if (episode) {
            const key = `${episode.season}:${episode.episode}`;
            const prog = ProgressLogic.getProgress(progressMap, key);
            if (prog && !prog.watched) {
                startTime = prog.time || 0;
            }
        }

        streamsPopupVisible.set(false);

        router.navigate("player", {
            videoSrc: stream.directPlaybackMode === "iframe" ? null : url,
            embedSrc: stream.directPlaybackMode === "iframe" ? url : null,
            fileIdx,
            metaData: data,
            startTime,
            season: episode?.season ?? null,
            episode: episode?.episode ?? null,
            streamAvailability: stream.raffiAvailability ?? null,
        }, { replace: options?.replace });
    } else {
        console.warn("Stream has no URL", stream);
    }
};

export const onStreamClick = (stream: Stream, progressMap: ProgressMap) => {
    if (isStreamFailed(stream)) {
        streamFailureMessage.set("This stream failed previously. Please select another stream.");
        return;
    }


    const isTorrent = isTorrentSource(stream);

    if (isTorrent) {
        if (!get(allowTorrenting)) {
            streamFailureMessage.set("Torrenting is disabled. Turn on Allow Torrenting in Settings to play this source.");
            return;
        }
        if (!hasAcknowledgedTorrentWarning()) {
            pendingTorrentStream.set(stream);
            showTorrentWarning.set(true);
            return;
        }
    }

    playStream(stream, progressMap);
};

export const handleTorrentWarningConfirm = (progressMap: ProgressMap) => {
    const pending = get(pendingTorrentStream);
    if (!pending) return;
    if (!get(allowTorrenting)) {
        showTorrentWarning.set(false);
        pendingTorrentStream.set(null);
        streamFailureMessage.set("Torrenting is disabled. Turn on Allow Torrenting in Settings to play this source.");
        return;
    }
    acknowledgeTorrentWarning();
    showTorrentWarning.set(false);
    playStream(pending, progressMap);
    pendingTorrentStream.set(null);
};

export const handleTorrentWarningCancel = () => {
    showTorrentWarning.set(false);
    pendingTorrentStream.set(null);
};

export const markCurrentStreamAsFailed = (reason?: string) => {
    const stream = get(selectedStream);
    if (!stream) return;
    markStreamFailed(
        stream,
        reason || "Bad torrent stream detected. Please select another stream.",
    );
};


export const closeStreamsPopup = () => {
    streamFetchGeneration += 1;
    shownStreamsKey = "";
    startingPlayback.set(false);
    loadingStreams.set(false);
    streamsPopupVisible.set(false);
    streams.set([]);
};
