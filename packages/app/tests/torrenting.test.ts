import { describe, expect, test } from "bun:test";
import { isTorrentSource } from "../src/lib/stores/torrenting";

describe("torrent source visibility", () => {
    test("recognizes only sources that would enter torrent playback", () => {
        expect(isTorrentSource({ infoHash: "abc123" })).toBe(true);
        expect(isTorrentSource({ url: "magnet:?xt=urn:btih:abc123" })).toBe(true);
        expect(isTorrentSource({ url: "https://media.example/video.mkv" })).toBe(false);
    });
});
