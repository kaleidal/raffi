import type { ShowResponse } from "../../../../lib/library/types/meta_types";
import type { ProbedStream, ClientPlaybackController } from "../../../../lib/media";
import type { Chapter } from "../../types";

export type PlayerSessionLoaderDeps = {
    getFileIdx: () => number | null;
    getStartTime: () => number;
    getMetaData: () => ShowResponse | null;
    getSeason: () => number | null;
    getEpisode: () => number | null;
    getVideoElem: () => HTMLVideoElement | undefined;
    getHls: () => any;
    setHls: (value: any) => void;
    getPlaybackController: () => ClientPlaybackController | null;
    setPlaybackController: (value: ClientPlaybackController | null) => void;
    setHasStarted: (value: boolean) => void;
    setIntroDbChapters: (chapters: Chapter[]) => void;
    resolvePlaybackStart: (context: {
        sessionData: any;
        startTime: number;
        metaData: ShowResponse | null;
        season: number | null;
        episode: number | null;
    }) => Promise<{
        effectiveStartTime: number;
        introDbChapters: Chapter[];
    }>;
    startTorrentStatusPolling: (torrentId: string) => void;
    awaitTorrentReady: (torrentId: string) => Promise<void>;
    stopTorrentStatusPolling: () => void;
    awaitDomUpdate: () => Promise<void>;
    handleProviderStatusMedia?: (context: {
        source: string;
        meta: ProbedStream;
    }) => boolean;
};
