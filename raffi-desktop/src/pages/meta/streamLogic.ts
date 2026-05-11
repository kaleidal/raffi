import { get } from "svelte/store";
import {
    loadingStreams, streams, streamsPopupVisible, selectedEpisode,
    selectedAddon, metaData, selectedStreamUrl,
    selectedStream, selectedFileIdx, showTorrentWarning, pendingTorrentStream,
    streamFailureMessage,
    progressMap,
} from "./metaState";
import { router } from "../../lib/stores/router";

import type { Stream } from "./types";
import { getLocalStreamsFor } from "../../lib/localLibrary/localLibrary";
import { trackEvent } from "../../lib/analytics";
import * as ProgressLogic from "./progressLogic";
import { createDirectStream } from "../../lib/streaming/directLinks";
import { getStreamingSourceSettings } from "../../lib/streaming/sourceSettings";
import {
    clearStreamFailureMessage,
    isStreamFailed,
    markStreamFailed,
} from "./streamFailures";

const getStreamAnalyticsProps = (stream: Stream) => {
    const isTorrent = Boolean(
        stream.infoHash || (stream.url && stream.url.startsWith("magnet:")),
    );
    const isLocal = stream.raffiSource === "local";
    const isDirect = stream.raffiSource === "direct";
    const sourceType = isLocal ? "local" : isTorrent ? "torrent" : "direct";

    return {
        source_type: sourceType,
        is_torrent: isTorrent,
        is_local: isLocal,
        is_direct_source: isDirect,
        direct_playback_mode: stream.directPlaybackMode || null,
        has_file_index: stream.fileIdx != null,
        addon: stream.name || null,
        has_binge_group: Boolean(stream.behaviorHints?.bingeGroup),
    };
};

const getStreamListStats = (items: Stream[]) => {
    const localCount = items.filter((stream) => stream.raffiSource === "local").length;
    const torrentCount = items.filter((stream) =>
        Boolean(stream.infoHash || (stream.url && stream.url.startsWith("magnet:"))),
    ).length;
    const directCount = items.filter((stream) => stream.raffiSource === "direct").length;

    return {
        total: items.length,
        local: localCount,
        addon: Math.max(0, items.length - localCount - directCount),
        torrent: torrentCount,
        direct: directCount,
    };
};

const getStartTimeForCurrentSelection = (progressMap: any, data: any, episode: any) => {
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
    episode: any,
    silent: boolean = false,
    setActive: boolean = true,
    imdbID: string,
) => {
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
        if (settings.mode === "direct") {
            const localStreams = getLocalStreamsFor(imdbID, type as any, episode);
            const currentProgressMap = get(progressMap);
            const directStream = createDirectStream(settings.direct, {
                metaData: data,
                imdbId: imdbID,
                episode,
                progressSeconds: getStartTimeForCurrentSelection(currentProgressMap, data, episode),
            });
            const combined = [...(localStreams as any), ...(directStream ? [directStream] : [])];
            streams.set(combined);
            trackEvent("stream_list_loaded", {
                content_type: type,
                source_mode: "direct",
                ...getStreamListStats(combined),
            });

            if (directStream && !silent) {
                trackEvent("direct_stream_autoplayed", getStreamAnalyticsProps(directStream));
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
        const response = await fetch(
            addonUrl + "/stream/" + type + "/" + streamId + ".json",
        );
        const result = await response.json();

        const remoteStreams: Stream[] = Array.isArray(result.streams)
            ? result.streams
            : [];

        const localStreams = getLocalStreamsFor(imdbID, type as any, episode);
        const combined = [...(localStreams as any), ...remoteStreams];
        streams.set(combined);
        trackEvent("stream_list_loaded", {
            content_type: type,
            source_mode: "addons",
            ...getStreamListStats(combined),
        });
        return combined;

    } catch (e) {
        console.error("Failed to fetch streams", e);
        const fallbackType = get(metaData)?.meta?.type || "movie";
        trackEvent("stream_list_failed", {
            content_type: fallbackType,
            error_name: e instanceof Error ? e.name : "unknown",
        });
        try {
            const data = get(metaData);
            const type = data?.meta?.type || "movie";
            const localStreams = getLocalStreamsFor(imdbID, type as any, episode);
            streams.set(localStreams as any);
            return localStreams as any;
        } catch {
            // ignore
        }
    } finally {
        loadingStreams.set(false);
    }
    return [];
};

export const streamToPlayableUrl = (stream: Stream): { url: string; fileIdx: number | null } | null => {
    if (!stream.url && !stream.infoHash) return null;
    let url = stream.url;
    const fileIdx = stream.infoHash ? (stream.fileIdx ?? null) : null;
    if (stream.infoHash) {
        url = `magnet:?xt=urn:btih:${stream.infoHash}`;
    }
    return url ? { url, fileIdx } : null;
};

export const fetchStreamListForEpisodeOnly = async (episode: any, imdbID: string): Promise<Stream[]> => {
    const data = get(metaData);
    if (!data) return [];

    const type = data.meta.type;
    const settings = await getStreamingSourceSettings();
    if (settings.mode === "direct") {
        const localStreams = getLocalStreamsFor(imdbID, type as any, episode);
        const directStream = createDirectStream(settings.direct, {
            metaData: data,
            imdbId: imdbID,
            episode,
            progressSeconds: 0,
        });
        return [...(localStreams as any), ...(directStream ? [directStream] : [])];
    }

    let streamId = imdbID;
    if (type === "series") {
        streamId += `:${episode.season}:${episode.episode}`;
    }

    const addonUrl = get(selectedAddon);
    try {
        const response = await fetch(
            addonUrl + "/stream/" + type + "/" + streamId + ".json",
        );
        const result = await response.json();
        const remoteStreams: Stream[] = Array.isArray(result.streams)
            ? result.streams
            : [];
        const localStreams = getLocalStreamsFor(imdbID, type as any, episode);
        return [...(localStreams as any), ...remoteStreams];
    } catch (e) {
        console.error("fetchStreamListForEpisodeOnly failed", e);
        try {
            const type = data.meta.type;
            const localStreams = getLocalStreamsFor(imdbID, type as any, episode);
            return localStreams as any;
        } catch {
            return [];
        }
    }
};


export const episodeClicked = async (episode: any, imdbID: string) => {
    await fetchStreams(episode, false, true, imdbID);
};

export const playStream = (
    stream: Stream,
    progressMap: any,
    options?: { replace?: boolean; autoSkipFromNextEpisode?: boolean },
) => {
    let url = stream.url;
    const fileIdx = stream.infoHash ? (stream.fileIdx ?? null) : null;

    if (stream.infoHash) {
        url = `magnet:?xt=urn:btih:${stream.infoHash}`;
    }

    if (url) {
        clearStreamFailureMessage();
        selectedStream.set(stream);
        selectedStreamUrl.set(url);
        selectedFileIdx.set(fileIdx);

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

        const routerState = get(router);
        const routeJoinPartyId =
            typeof routerState?.params?.joinPartyId === "string"
                ? routerState.params.joinPartyId
                : null;
        const routeAutoJoin = Boolean(routerState?.params?.autoJoin);

        router.navigate("player", {
            videoSrc: stream.directPlaybackMode === "iframe" ? null : url,
            embedSrc: stream.directPlaybackMode === "iframe" ? url : null,
            fileIdx,
            metaData: data,
            startTime,
            season: episode?.season ?? null,
            episode: episode?.episode ?? null,
            joinPartyId: routeJoinPartyId,
            autoJoin: routeJoinPartyId ? routeAutoJoin : false,
            autoSkipFromNextEpisode: Boolean(options?.autoSkipFromNextEpisode),
        }, { replace: options?.replace });
    } else {
        console.warn("Stream has no URL", stream);
    }
};

export const onStreamClick = (stream: Stream, progressMap: any) => {
    if (isStreamFailed(stream)) {
        trackEvent("stream_blocked_failed", getStreamAnalyticsProps(stream));
        streamFailureMessage.set("This stream failed previously. Please select another stream.");
        return;
    }

    trackEvent("stream_selected", getStreamAnalyticsProps(stream));

    const isTorrent = stream.infoHash || (stream.url && stream.url.startsWith("magnet:"));

    if (isTorrent) {
        const hasSeenWarning = localStorage.getItem("torrentWarningShown");
        if (!hasSeenWarning) {
            pendingTorrentStream.set(stream);
            showTorrentWarning.set(true);
            return;
        }
    }

    playStream(stream, progressMap);
};

export const handleTorrentWarningConfirm = (progressMap: any) => {
    localStorage.setItem("torrentWarningShown", "true");
    showTorrentWarning.set(false);
    const pending = get(pendingTorrentStream);
    if (pending) {
        trackEvent("torrent_warning_confirmed", getStreamAnalyticsProps(pending));
        playStream(pending, progressMap);
        pendingTorrentStream.set(null);
    }
};

export const handleTorrentWarningCancel = () => {
    const pending = get(pendingTorrentStream);
    if (pending) {
        trackEvent("torrent_warning_cancelled", getStreamAnalyticsProps(pending));
    }
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


export const closePlayer = () => {
    selectedStreamUrl.set(null);
    router.back();
};

export const closeStreamsPopup = () => {
    streamsPopupVisible.set(false);
    streams.set([]);
};
