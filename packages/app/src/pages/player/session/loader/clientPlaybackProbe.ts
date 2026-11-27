import { resolveHttpPlayback } from "../../../../lib/media";
import { loadingStage, loadingDetails } from "../../playerState";

export type ClientPlayback = Awaited<ReturnType<typeof resolveHttpPlayback>>;

/** Resolves how the app can play the source itself, or null when the load was aborted mid-probe. */
export async function probeClientPlayback(
    playableSrc: string,
    videoElem: HTMLVideoElement | undefined,
    signal: AbortSignal,
    fromLimbo: boolean,
): Promise<ClientPlayback | null> {
    loadingStage.set("Probing stream");
    loadingDetails.set(
        fromLimbo
            ? "Checking torrent stream codecs..."
            : /^https?:\/\//i.test(playableSrc)
              ? "Checking codecs..."
              : "Checking local file codecs...",
    );
    try {
        return await resolveHttpPlayback(
            playableSrc,
            videoElem,
            signal,
            fromLimbo ? { probeTimeoutMs: null } : undefined,
        );
    } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
            return null;
        }
        console.warn("Client playback probe failed", error);
        return {
            mode: "unsupported",
            meta: null,
            reason: "probe-error",
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
