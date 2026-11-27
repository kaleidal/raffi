import { get } from "svelte/store";
import {
    addLimboTorrent,
    LimboUnavailableError,
    removeLimboTorrent,
    type LimboTorrentStatus,
} from "../../../../lib/streams/limboClient";
import { ensureTorrentingAllowed } from "../../../../lib/stores/torrenting";
import { selectedStream } from "../../../meta/metaState";
import { loadingStage, loadingDetails, loadingProgress } from "../../playerState";
import type { ClientPlayback } from "./clientPlaybackProbe";
import type { PlayerSessionLoaderDeps } from "./sessionLoaderDeps";

type LimboTorrentTracking = Pick<
    PlayerSessionLoaderDeps,
    "startTorrentStatusPolling" | "awaitTorrentReady"
> & {
    onTorrentAdded: (torrentId: string) => void;
};

const selectedStreamName = () => {
    const stream = get(selectedStream);
    if (!stream) return null;
    return (
        stream.behaviorHints?.filename?.trim() ||
        stream.title?.trim() ||
        stream.name?.trim() ||
        null
    );
};

export async function resolveLimboStream(
    magnet: string,
    fileIdx: number | null,
    signal: AbortSignal,
    tracking: LimboTorrentTracking,
): Promise<{ streamUrl: string; status: LimboTorrentStatus }> {
    loadingStage.set("Connecting to Limbo");
    loadingDetails.set("Making sure Limbo is running…");
    loadingProgress.set(null);

    try {
        await ensureTorrentingAllowed(signal);
    } catch (error) {
        if (error instanceof LimboUnavailableError) {
            throw new Error(
                `${error.message} Get it at https://limbo.kaleid.al`,
            );
        }
        throw error;
    }

    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    loadingStage.set("Waiting for Limbo approval");
    loadingDetails.set("Approve the request in Limbo if prompted…");
    const created = await addLimboTorrent(
        {
            magnet,
            fileIndex: fileIdx,
            sequential: true,
            name: selectedStreamName(),
        },
        signal,
    );
    if (signal.aborted) {
        await removeLimboTorrent(created.id, false);
        throw new DOMException("Aborted", "AbortError");
    }
    tracking.onTorrentAdded(created.id);
    tracking.startTorrentStatusPolling(created.id);
    await tracking.awaitTorrentReady(created.id);

    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    const { getLimboTorrent } = await import("../../../../lib/streams/limboClient");
    const ready = await getLimboTorrent(created.id, signal);
    if (!ready.streamUrl) {
        throw new Error("Limbo did not return a stream URL for this torrent");
    }
    return { streamUrl: ready.streamUrl, status: ready };
}

export function limboPlaybackFailure(clientPlayback: ClientPlayback | null): Error {
    const probeReason = String(clientPlayback?.reason || "");
    const probeError = String(clientPlayback?.error || "");
    const details = `${probeReason} ${probeError}`.toLowerCase();
    if (
        details.includes("404") ||
        details.includes("not found") ||
        details.includes("failed to fetch") ||
        details.includes("network")
    ) {
        return new Error(
            "Limbo could not serve this torrent stream yet. Wait a moment or try another source.",
        );
    }
    return new Error(
        probeReason === "probe-error" || probeReason === "probe-failed"
            ? "Could not probe the Limbo torrent stream. Try another source."
            : "This torrent needs codecs Raffi cannot remux yet. Try another source.",
    );
}
