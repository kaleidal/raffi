import { markCurrentStreamAsFailed, reopenStreamsOnReturn } from "../../../meta/streamLogic";
import { errorDetails, errorMessage, loading, showCanvas, showError } from "../../playerState";

const TORRENT_FAILURE_EXIT_MS = 1400;

/** Marks a torrent that cannot stream as failed, shows why, then returns to the stream list. */
export function createTorrentFailureExit({ imdbId, close }: { imdbId: string | null; close: () => void }) {
    let exitTimeout: ReturnType<typeof setTimeout> | null = null;

    const cancel = () => {
        if (exitTimeout) clearTimeout(exitTimeout);
        exitTimeout = null;
    };

    function fail(message: string) {
        cancel();
        const details = String(message || "").trim();
        const reason = details
            ? `Bad torrent stream: ${details}. Please select another stream.`
            : "Bad torrent stream. Please select another stream.";
        markCurrentStreamAsFailed(reason);
        loading.set(false);
        showCanvas.set(false);
        showError.set(true);
        errorMessage.set("Stream failed");
        errorDetails.set(reason);
        reopenStreamsOnReturn(imdbId);
        exitTimeout = setTimeout(() => {
            exitTimeout = null;
            showError.set(false);
            close();
        }, TORRENT_FAILURE_EXIT_MS);
    }

    return { fail, cancel };
}
