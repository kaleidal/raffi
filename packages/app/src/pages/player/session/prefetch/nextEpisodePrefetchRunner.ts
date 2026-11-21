import * as NavigationLogic from "../../../meta/navigationLogic";
import { streamToPlayableUrl } from "../../../meta/streamLogic";
import { needsResolve, resolveBrowserStream } from "../../../../lib/streams/browserStreams";
import { startNextEpisodePrefetch, type NextEpisodePrefetchHandoff } from "./nextEpisodePrefetch";

const RETRY_DELAY_MS = 10_000;

type ResolvedNextEpisode = Awaited<ReturnType<typeof NavigationLogic.resolveNextEpisodeStream>>;

/** Resolves and buffers the next episode on the idle video surface while the credits approach. */
export function createNextEpisodePrefetchRunner(imdbId: string, getIdleVideo: () => HTMLVideoElement | null) {
    let disposePrefetch: ((opts?: { transfer?: boolean }) => void) | null = null;
    let handoff: NextEpisodePrefetchHandoff | null = null;
    let resolved: ResolvedNextEpisode = null;
    let runId = 0;
    let starting = false;
    let task: Promise<void> | null = null;
    let abort: AbortController | null = null;
    let retryAt = 0;

    const retryLater = () => {
        retryAt = Date.now() + RETRY_DELAY_MS;
    };

    function dispose(opts?: { transfer?: boolean }) {
        runId += 1;
        starting = false;
        abort?.abort();
        abort = null;
        task = null;
        retryAt = 0;
        disposePrefetch?.(opts);
        disposePrefetch = null;
        handoff = null;
        resolved = null;
    }

    async function run(id: number, signal: AbortSignal) {
        try {
            const next = await NavigationLogic.resolveNextEpisodeStream(imdbId);
            if (id !== runId) return;
            const video = getIdleVideo();
            const playable = next ? streamToPlayableUrl(next.stream) : null;
            if (!video || !next || !playable) return retryLater();
            const source = needsResolve(playable.url) ? await resolveBrowserStream(playable.url) : playable.url;
            if (id !== runId) return;
            const started = await startNextEpisodePrefetch(source, playable.fileIdx, video, () => {}, signal);
            if (id !== runId) return started.dispose?.();
            if (!started.dispose || !started.handoff) return retryLater();
            disposePrefetch = started.dispose;
            handoff = { ...started.handoff, src: playable.url };
            resolved = next;
        } catch (error) {
            if (id === runId) {
                resolved = null;
                handoff = null;
            }
            if (!(error instanceof DOMException && error.name === "AbortError")) {
                console.warn("Next episode prefetch attempt failed", error);
                retryLater();
            }
        } finally {
            if (id === runId) {
                starting = false;
                abort = null;
                task = null;
            }
        }
    }

    function maybeStart(time: number, window: { startAt: number; creditsAt: number }) {
        if (disposePrefetch || starting || resolved || Date.now() < retryAt) return;
        if (window.creditsAt <= 0 || window.startAt >= window.creditsAt || time < window.startAt) return;
        starting = true;
        abort = new AbortController();
        task = run(++runId, abort.signal);
    }

    /** Gives a prefetch that is still resolving a moment to finish, so clicking Next right as it starts still reuses it. */
    async function takeResolved(graceMs: number) {
        if (starting && task) {
            await Promise.race([task, new Promise<void>((resolve) => setTimeout(resolve, graceMs))]);
        }
        if (resolved) return resolved;
        if (starting) dispose();
        return null;
    }

    return {
        maybeStart,
        takeResolved,
        dispose,
        get handoff() {
            return handoff;
        },
    };
}
