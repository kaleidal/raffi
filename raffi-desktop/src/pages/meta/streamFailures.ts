import { get } from "svelte/store";
import type { Stream } from "./types";
import { failedStreamKeys, streamFailureMessage } from "./metaState";

const STREAM_FAILURES_STORAGE_KEY = "raffi.streamFailures.v1";

const persistStreamFailures = () => {
    if (typeof window === "undefined") return;
    try {
        const payload = {
            failedKeys: get(failedStreamKeys),
            message: get(streamFailureMessage),
        };
        sessionStorage.setItem(
            STREAM_FAILURES_STORAGE_KEY,
            JSON.stringify(payload),
        );
    } catch {
        // ignore
    }
};

export const hydrateStreamFailures = () => {
    if (typeof window === "undefined") return;
    try {
        const raw = sessionStorage.getItem(STREAM_FAILURES_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as {
            failedKeys?: unknown;
            message?: unknown;
        };
        if (Array.isArray(parsed.failedKeys)) {
            failedStreamKeys.set(
                parsed.failedKeys.filter(
                    (item): item is string => typeof item === "string",
                ),
            );
        }
        if (typeof parsed.message === "string") {
            streamFailureMessage.set(parsed.message);
        }
    } catch {
        // ignore
    }
};

export const getStreamFailureKey = (stream: Stream | null | undefined): string | null => {
    if (!stream) return null;

    if (stream.infoHash) {
        const fileIdxPart =
            stream.fileIdx == null || Number.isNaN(Number(stream.fileIdx))
                ? "na"
                : String(stream.fileIdx);
        return `torrent:${stream.infoHash}:${fileIdxPart}`;
    }

    if (stream.url) {
        return `url:${stream.url}`;
    }

    return null;
};

export const isStreamFailed = (stream: Stream | null | undefined): boolean => {
    const key = getStreamFailureKey(stream);
    if (!key) return false;
    return get(failedStreamKeys).includes(key);
};

export const markStreamFailed = (
    stream: Stream | null | undefined,
    reason = "This stream failed to load. Please select another stream.",
) => {
    const key = getStreamFailureKey(stream);
    if (!key) return;

    failedStreamKeys.update((keys) => {
        if (keys.includes(key)) return keys;
        return [...keys, key];
    });
    streamFailureMessage.set(reason);
    persistStreamFailures();
};

export const clearStreamFailureMessage = () => {
    streamFailureMessage.set("");
    persistStreamFailures();
};
