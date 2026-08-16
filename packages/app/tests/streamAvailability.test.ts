import { describe, expect, test } from "bun:test";
import {
    classifyStreamPreflight,
    getResponseTotalBytes,
    isLikelyProviderStatusMedia,
    isStreamPreparationPending,
} from "../src/lib/streams/streamAvailability";

describe("stream availability preflight", () => {
    test("accepts immediately readable media responses", () => {
        expect(classifyStreamPreflight({
            ok: true,
            status: 206,
            contentType: "video/x-matroska",
        })).toEqual({ state: "ready", status: 206, totalBytes: null });
    });

    test("does not mistake an error document for playable media", () => {
        expect(classifyStreamPreflight({
            ok: true,
            status: 200,
            contentType: "application/json; charset=utf-8",
        })).toEqual({ state: "unavailable", status: 200 });
    });

    test("recognizes provider preparation statuses", () => {
        expect(classifyStreamPreflight({
            ok: false,
            status: 503,
            contentType: "application/json",
        })).toEqual({ state: "preparing", status: 503 });
    });

    test("reports a timeout as a network failure", () => {
        expect(classifyStreamPreflight({
            ok: false,
            status: 0,
            contentType: "",
            timedOut: true,
        })).toEqual({ state: "network-error", status: null });
    });

    test("keeps transport failures separate from provider responses", () => {
        expect(classifyStreamPreflight({
            ok: false,
            status: 0,
            contentType: "",
            networkError: true,
        })).toEqual({ state: "network-error", status: null });
    });

    test("trusts a successful preflight over a stale uncached addon hint", () => {
        expect(isStreamPreparationPending({ state: "ready", status: 206, totalBytes: null }, false)).toBe(false);
    });

    test("trusts provider preparation over a stale cached addon hint", () => {
        expect(isStreamPreparationPending({ state: "preparing", status: 503 }, true)).toBe(true);
    });

    test("does not turn authentication or network failures into cache notices", () => {
        expect(isStreamPreparationPending({ state: "unavailable", status: 403 }, false)).toBe(false);
        expect(isStreamPreparationPending({ state: "network-error", status: null }, false)).toBe(false);
    });

    test("reads the complete media size from a range response", () => {
        expect(getResponseTotalBytes(206, "bytes 0-1/3543348019", "2")).toBe(3543348019);
        expect(getResponseTotalBytes(200, null, "1234567")).toBe(1234567);
        expect(getResponseTotalBytes(206, null, "2")).toBeNull();
    });

    test("recognizes a tiny provider slate in place of an advertised movie", () => {
        expect(isLikelyProviderStatusMedia({
            expectedSizeBytes: 3.3 * 1024 * 1024 * 1024,
            actualSizeBytes: 1.2 * 1024 * 1024,
        })).toBe(true);
    });

    test("rejects short addon media that cannot be the selected movie or episode", () => {
        expect(isLikelyProviderStatusMedia({
            expectedSizeBytes: null,
            durationSeconds: 299,
        })).toBe(true);
        expect(isLikelyProviderStatusMedia({
            expectedSizeBytes: null,
            durationSeconds: 300,
        })).toBe(false);
    });

    test("does not reject normal long-form media", () => {
        expect(isLikelyProviderStatusMedia({
            expectedSizeBytes: 3.3 * 1024 * 1024 * 1024,
            actualSizeBytes: 3.3 * 1024 * 1024 * 1024,
            durationSeconds: 2580,
        })).toBe(false);
    });
});
