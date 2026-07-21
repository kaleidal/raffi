import { get } from "svelte/store";
import { decoderFetch } from "../../lib/client";
import { loading, loadingDetails, loadingProgress, loadingStage } from "./playerState";

export const createTorrentStatusPoller = ({
    serverUrl,
    onTorrentError,
}: {
    serverUrl: string;
    onTorrentError?: (message: string) => void;
}) => {
    let intervalRef: ReturnType<typeof setInterval> | null = null;
    let statusHash: string | null = null;
    let fatalHandled = false;
    let readyPromise: Promise<void> | null = null;
    let resolveReady: (() => void) | null = null;
    let rejectReady: ((error: Error) => void) | null = null;

    const stop = () => {
        if (intervalRef) {
            clearInterval(intervalRef);
            intervalRef = null;
        }
        statusHash = null;
        fatalHandled = false;
        if (rejectReady) {
            rejectReady(new Error("Torrent readiness wait canceled"));
        }
        readyPromise = null;
        resolveReady = null;
        rejectReady = null;
    };

    const start = (hash: string) => {
        if (!hash) return;
        if (intervalRef && statusHash === hash) return;

        stop();
        statusHash = hash;
        fatalHandled = false;
        readyPromise = new Promise<void>((resolve, reject) => {
            resolveReady = resolve;
            rejectReady = reject;
        });

        const poll = async () => {
            try {
                const response = await decoderFetch(`${serverUrl}/torrents/${hash}/status`);
                if (!response.ok) return;

                const data = await response.json();
                const stage = String(data.stage || "");
                const peers = typeof data.peers === "number" ? data.peers : null;
                const piecesComplete =
                    typeof data.piecesComplete === "number" ? data.piecesComplete : null;
                const piecesTotal =
                    typeof data.piecesTotal === "number" ? data.piecesTotal : null;
                const progress = typeof data.progress === "number" ? data.progress : null;
                const error = typeof data.error === "string" ? data.error : "";

                if (error) {
                    loadingStage.set("Torrent error");
                    loadingDetails.set(error);
                    loadingProgress.set(null);
                    if (!fatalHandled) {
                        fatalHandled = true;
                        onTorrentError?.(error);
                    }
                    rejectReady?.(new Error(error));
                    resolveReady = null;
                    rejectReady = null;
                    return;
                }

                if (stage === "metadata") {
                    loadingStage.set("Torrent: fetching metadata");
                    loadingDetails.set(peers != null ? `Peers: ${peers}` : "");
                    loadingProgress.set(null);
                    return;
                }

                if (stage === "downloading") {
                    loadingStage.set("Torrent: downloading");
                    const detailParts: string[] = [];
                    if (peers != null) detailParts.push(`Peers: ${peers}`);
                    if (piecesComplete != null && piecesTotal != null) {
                        detailParts.push(
                            `Startup pieces: ${piecesComplete}/${piecesTotal}`,
                        );
                    }
                    loadingDetails.set(detailParts.join(" • "));
                    loadingProgress.set(progress);
                    return;
                }

                if (stage === "ready") {
                    if (get(loading)) {
                        loadingStage.set("Torrent: ready (starting stream)");
                        loadingDetails.set("");
                    }
                    loadingProgress.set(null);
                    resolveReady?.();
                    resolveReady = null;
                    rejectReady = null;
                }
            } catch {
                // ignore polling errors
            }
        };

        void poll();
        intervalRef = setInterval(poll, 1000);
    };

    const waitUntilReady = (hash: string) => {
        start(hash);
        return readyPromise ?? Promise.resolve();
    };

    return {
        start,
        stop,
        waitUntilReady,
    };
};
