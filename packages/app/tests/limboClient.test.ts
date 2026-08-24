import { describe, expect, test } from "bun:test";
import {
    assertLimboCompatible,
    LimboApiError,
    LimboUnavailableError,
    parseLimboTorrentStatus,
} from "../src/lib/limbo/client";

describe("Limbo companion contract", () => {
    test("rejects the incomplete v1 API", () => {
        expect(() => assertLimboCompatible({ ok: true, apiVersion: 1 })).toThrow(
            LimboUnavailableError,
        );
    });

    test("rejects malformed status payloads instead of polling forever", () => {
        expect(() => parseLimboTorrentStatus({ id: "torrent", status: "downloading" })).toThrow(
            LimboApiError,
        );
    });

    test("accepts the v2 status shape", () => {
        const status = parseLimboTorrentStatus({
            id: "torrent",
            infoHash: null,
            name: "Example",
            status: "downloading",
            stage: "metadata",
            progress: 0,
            downloadSpeed: 0,
            uploadSpeed: 0,
            peers: 0,
            seeds: 0,
            size: 0,
            downloaded: 0,
            files: [],
            selectedFileIndex: null,
            streamUrl: null,
            ready: false,
            contiguousBytes: 0,
            clientId: "raffi",
            lastError: null,
        });
        expect(status.stage).toBe("metadata");
    });
});
