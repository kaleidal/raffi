import { get } from "svelte/store";
import {
    loadingStreams, streams, streamsPopupVisible, selectedEpisode,
    selectedAddon, metaData, playerVisible, selectedStreamUrl,
    selectedStream, selectedFileIdx, showTorrentWarning, pendingTorrentStream
} from "./metaState";
import type { Stream } from "./types";
import { getLocalStreamsFor } from "../../lib/localLibrary/localLibrary";

export const fetchStreams = async (
    episode: any,
    silent: boolean = false,
    setActive: boolean = true,
    imdbID: string
) => {
    loadingStreams.set(true);
    streams.set([]);

    if (!silent) {
        streamsPopupVisible.set(true);
    }

    if (setActive) {
        selectedEpisode.set(episode);
    }

    try {
        const data = get(metaData);
        if (!data) return [];

        const type = data.meta.type;
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
        return combined;
    } catch (e) {
        console.error("Failed to fetch streams", e);
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

export const episodeClicked = async (episode: any, imdbID: string) => {
    await fetchStreams(episode, false, true, imdbID);
};

export const playStream = (stream: Stream, progressMap: any) => {
    let url = stream.url;

    if (stream.infoHash) {
        url = `magnet:?xt=urn:btih:${stream.infoHash}`;
        selectedFileIdx.set(stream.fileIdx ?? null);
    } else {
        selectedFileIdx.set(null);
    }

    if (url) {
        selectedStream.set(stream);
        selectedStreamUrl.set(url);

        // Start time logic is handled in Meta.svelte or passed to Player
        // We just set the state here

        playerVisible.set(true);
        streamsPopupVisible.set(false);
    } else {
        console.warn("Stream has no URL", stream);
    }
};

export const onStreamClick = (stream: Stream, progressMap: any) => {
    // Check if it's a torrent
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
        playStream(pending, progressMap);
        pendingTorrentStream.set(null);
    }
};

export const handleTorrentWarningCancel = () => {
    showTorrentWarning.set(false);
    pendingTorrentStream.set(null);
};

export const closePlayer = () => {
    playerVisible.set(false);
    selectedStreamUrl.set(null);
};

export const closeStreamsPopup = () => {
    streamsPopupVisible.set(false);
    streams.set([]);
};
