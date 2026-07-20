import type Hls from "hls.js";
import { createSession, serverUrl } from "../../lib/client";
import * as Session from "./videoSession";

const noop = () => {};

export function getBufferedRatioFromStart(video: HTMLVideoElement): number {
    const d = video.duration;
    if (!Number.isFinite(d) || d <= 0) return 0;
    const b = video.buffered;
    if (!b || b.length === 0) return 0;
    let maxEnd = 0;
    for (let i = 0; i < b.length; i++) {
        maxEnd = Math.max(maxEnd, b.end(i));
    }
    return Math.max(0, Math.min(1, maxEnd / d));
}

export type NextEpisodePrefetchHandoff = {
    sessionId: string;
    sessionData: unknown;
    src: string;
    fileIdx: number | null;
};

export async function startNextEpisodePrefetch(
    src: string,
    fileIdx: number | null,
    videoElem: HTMLVideoElement,
    onBufferRatio: (ratio: number) => void,
): Promise<{
    dispose: ((opts?: { transfer?: boolean }) => void) | null;
    handoff: NextEpisodePrefetchHandoff | null;
}> {
    let hlsInstance: Hls | null = null;
    let sessionId = "";
    let sessionData: unknown = null;
    let pollId: ReturnType<typeof setInterval> | null = null;
    let prepareAbort: AbortController | null = null;
    let disposed = false;
    let sessionCleaned = false;

    const stopPolling = () => {
        if (pollId != null) {
            clearInterval(pollId);
            pollId = null;
        }
    };

    const dispose = (opts?: { transfer?: boolean }) => {
        disposed = true;
        prepareAbort?.abort();
        prepareAbort = null;
        stopPolling();
        if (hlsInstance) {
            try {
                hlsInstance.destroy();
            } catch {
            }
            hlsInstance = null;
        }
        try {
            videoElem.pause();
        } catch {
        }
        videoElem.removeAttribute("src");
        try {
            videoElem.load();
        } catch {
        }
        if (!opts?.transfer && sessionId && !sessionCleaned) {
            sessionCleaned = true;
            Session.cleanupServerSession(sessionId);
        }
    };

    try {
        videoElem.muted = true;
        videoElem.defaultMuted = true;
        videoElem.playsInline = true;
        videoElem.setAttribute("playsinline", "");
        videoElem.preload = "auto";

        const bypass = Session.shouldBypassServerForHttpStream(src, videoElem);
        if (bypass) {
            videoElem.src = src;
            videoElem.load();
            pollId = setInterval(() => {
                onBufferRatio(getBufferedRatioFromStart(videoElem));
            }, 400);
            return { dispose, handoff: null };
        }

        const kind = src.startsWith("magnet:") ? "torrent" : "http";
        if (fileIdx != null && fileIdx !== undefined) {
            sessionId = await createSession(src, kind, 0, fileIdx, { prefetch: true });
        } else {
            sessionId = await createSession(src, kind, 0, undefined, { prefetch: true });
        }
        if (disposed) {
            dispose();
            return { dispose: null, handoff: null };
        }

        const res = await fetch(`${serverUrl}/sessions/${sessionId}`);
        if (!res.ok) throw new Error("prefetch session info failed");
        sessionData = await res.json();
        if (disposed) {
            dispose();
            return { dispose: null, handoff: null };
        }

        prepareAbort = new AbortController();
        const preparedManifestUrl = await Session.prepareHLSManifest(
            sessionId,
            null,
            prepareAbort.signal,
        );
        prepareAbort = null;
        if (disposed) {
            dispose();
            return { dispose: null, handoff: null };
        }

        hlsInstance = Session.initHLS(
            videoElem,
            sessionId,
            0,
            false,
            noop,
            {
                setLoading: noop,
                setShowCanvas: noop,
                setPlaybackOffset: noop,
                setShowError: noop,
                setErrorMessage: noop,
                setErrorDetails: noop,
            },
            null,
            "prefetch",
            preparedManifestUrl,
        );

        pollId = setInterval(() => {
            onBufferRatio(getBufferedRatioFromStart(videoElem));
        }, 400);

        const handoff: NextEpisodePrefetchHandoff = {
            sessionId,
            sessionData,
            src,
            fileIdx,
        };
        return { dispose, handoff };
    } catch (e) {
        if (disposed || (e instanceof DOMException && e.name === "AbortError")) {
            return { dispose: null, handoff: null };
        }
        console.warn("Next episode prefetch failed", e);
        dispose();
        return { dispose: null, handoff: null };
    }
}
