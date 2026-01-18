import { get } from "svelte/store";
import {
    metaData, selectedEpisode, currentSeason, selectedStream,
    streamsPopupVisible, playerVisible, selectedStreamUrl, showTorrentWarning,
    pendingTorrentStream
} from "./metaState";
import { fetchStreams, playStream } from "./streamLogic";

export const handleNextEpisode = async (imdbID: string, progressMap: any) => {
    const episode = get(selectedEpisode);
    const data = get(metaData);

    if (!episode || !data || !data.meta.videos) return;

    const currentIndex = data.meta.videos.findIndex(
        (v: any) =>
            v.season === episode.season &&
            v.episode === episode.episode,
    );

    if (currentIndex !== -1 && currentIndex < data.meta.videos.length - 1) {
        const nextEp = data.meta.videos[currentIndex + 1];

        if (nextEp.season !== get(currentSeason)) {
            currentSeason.set(nextEp.season);
        }

        const nextStreams = await fetchStreams(nextEp, true, false, imdbID);
        const currentStream = get(selectedStream);

        let match = null;
        if (currentStream && nextStreams.length > 0) {
            const currentGroup = currentStream.behaviorHints?.bingeGroup;

            if (currentGroup) {
                match = nextStreams.find(
                    (s: any) =>
                        s.behaviorHints?.bingeGroup === currentGroup,
                );
            }

            if (!match) {
                match = nextStreams.find((s: any) => {
                    if (s.name !== currentStream.name) return false;
                    const currentTitle = currentStream.title?.split("\n")[0];
                    return currentTitle
                        ? s.title?.includes(currentTitle)
                        : true;
                });
            }

            if (!match) {
                match = nextStreams.find(
                    (s: any) => s.name === currentStream.name,
                );
            }
        }

        if (match) {
            console.log("Auto-selecting matching stream:", match);
            const isTorrent =
                match.infoHash ||
                (match.url && match.url.startsWith("magnet:"));

            if (isTorrent && !localStorage.getItem("torrentWarningShown")) {
                pendingTorrentStream.set(match);
                showTorrentWarning.set(true);
                playerVisible.set(false);
                selectedEpisode.set(nextEp);
            } else {
                selectedEpisode.set(nextEp);
                playStream(match, progressMap);
            }
        } else {
            streamsPopupVisible.set(true);
            playerVisible.set(false);
            selectedStreamUrl.set(null);
            selectedEpisode.set(nextEp);
        }
    } else {
        console.log("No next episode found");
        playerVisible.set(false);
    }
};
