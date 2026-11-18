import { get, writable } from "svelte/store";
import { selectedStream } from "../../meta/metaState";
import type { StreamAvailabilityHint } from "../../meta/types";
import { needsServerResolve, resolveBrowserStream } from "../../../lib/streams/browserStreams";
import {
    isLikelyProviderStatusMedia,
    isStreamPreparationPending,
    preflightStreamUrl,
} from "../../../lib/streams/streamAvailability";
import { errorDetails, errorMessage, loading, loadingDetails, loadingProgress, loadingStage, showError } from "../playerState";
import { streamConnectionFailure } from "./health/playbackFailure";

type Source = { src: string; fileIdx: number | null };

/** Makes sure a debrid source can start right away before handing it to the player, instead of playing a "still caching" clip. */
export function createSourcePreflight({
    getAvailability,
    isStillRequested,
    start,
    redirect,
    onCheckStarted,
}: {
    getAvailability: () => StreamAvailabilityHint | null;
    isStillRequested: (source: Source) => boolean;
    start: (source: Source) => void;
    redirect: (src: string) => void;
    onCheckStarted: () => void;
}) {
    const noticeVisible = writable(false);
    let checking: string | null = null;
    let blocked: string | null = null;
    let run = 0;

    const needsCheck = (src: string) => {
        const stream = get(selectedStream);
        return Boolean(
            getAvailability() &&
                /^https?:\/\//i.test(src) &&
                stream?.raffiSource !== "local" &&
                stream?.raffiSource !== "direct" &&
                stream?.directPlaybackMode !== "iframe",
        );
    };

    const isWaitingOn = (src: string) => src === checking || src === blocked;

    function block(src: string) {
        blocked = src;
        noticeVisible.set(true);
    }

    async function check(source: Source) {
        const { src } = source;
        const current = ++run;
        checking = src;
        noticeVisible.set(false);
        showError.set(false);
        errorMessage.set("");
        errorDetails.set("");
        onCheckStarted();
        loading.set(true);
        loadingStage.set("Checking availability");
        loadingDetails.set("Verifying that this source can start immediately.");
        loadingProgress.set(null);

        if (needsServerResolve(src)) {
            const resolved = await resolveBrowserStream(src);
            if (current !== run) return;
            if (resolved !== src) return redirect(resolved);
        }

        const result = await preflightStreamUrl(src);
        if (current !== run || !isStillRequested(source)) return;
        checking = null;

        if (result.state === "network-error") {
            blocked = src;
            const failure = streamConnectionFailure();
            errorMessage.set(failure.title);
            errorDetails.set(failure.details);
            showError.set(true);
            loading.set(false);
            return;
        }

        const availability = getAvailability();
        const looksLikeStatusMedia =
            result.state === "ready" &&
            isLikelyProviderStatusMedia({
                expectedSizeBytes: availability?.expectedSizeBytes ?? null,
                actualSizeBytes: result.totalBytes,
            });
        if (looksLikeStatusMedia || isStreamPreparationPending(result, availability?.cacheHint ?? null)) {
            block(src);
            loading.set(false);
            return;
        }

        start(source);
    }

    function request(source: Source) {
        if (isWaitingOn(source.src)) return;
        if (needsCheck(source.src)) void check(source);
        else start(source);
    }

    /** Clears a blocked source so it is checked again; false when the source was never blocked. */
    function retry(source: Source) {
        if (blocked !== source.src) return false;
        blocked = null;
        showError.set(false);
        request(source);
        return true;
    }

    function cancel() {
        run += 1;
    }

    return { noticeVisible, isWaitingOn, block, request, retry, cancel };
}
