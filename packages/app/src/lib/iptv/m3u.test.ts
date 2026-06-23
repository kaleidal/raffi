import { describe, expect, test } from "bun:test";
import { parseM3U } from "./m3u";

describe("parseM3U", () => {
    test("parses EXTINF attributes and following stream URL", () => {
        const playlist = `#EXTM3U
#EXTINF:-1 tvg-id="abc.us" tvg-name="ABC" tvg-logo="http://logo/abc.png" group-title="Local",ABC HD
stream-one
`;

        const result = parseM3U(playlist, "source-1");

        expect(result.channels).toHaveLength(1);
        expect(result.channels[0]).toMatchObject({
            sourceId: "source-1",
            tvgId: "abc.us",
            tvgName: "ABC",
            logo: "http://logo/abc.png",
            group: "Local",
            name: "ABC HD",
            url: "stream-one",
            order: 0,
        });
    });

    test("keeps commas inside quoted EXTINF attributes", () => {
        const playlist = `#EXTM3U
#EXTINF:-1 tvg-id="abc.us" tvg-name="ABC, East" group-title="Local, News",ABC HD
stream-one
`;

        const result = parseM3U(playlist, "source-1");

        expect(result.channels).toHaveLength(1);
        expect(result.channels[0]).toMatchObject({
            name: "ABC HD",
            tvgName: "ABC, East",
            group: "Local, News",
            url: "stream-one",
        });
        expect(result.groups.map((g) => g.name)).toEqual(["Local, News"]);
    });

    test("keeps provider order and handles missing attributes", () => {
        const playlist = `#EXTM3U
#EXTINF:-1,One
stream-one
#EXTINF:-1 group-title="News",Two
stream-two
`;

        const result = parseM3U(playlist, "source-1");

        expect(result.channels.map((c) => c.name)).toEqual(["One", "Two"]);
        expect(result.channels[0].group).toBe("Ungrouped");
        expect(result.groups.map((g) => g.name)).toEqual(["Ungrouped", "News"]);
    });

    test("skips EXTINF entries without a following playable URL", () => {
        const playlist = `#EXTM3U
#EXTINF:-1 group-title="Broken",Broken
#EXTINF:-1 group-title="Live",Working
stream-working
`;

        const result = parseM3U(playlist, "source-1");

        expect(result.channels.map((c) => c.name)).toEqual(["Working"]);
        expect(result.groups.map((g) => g.name)).toEqual(["Live"]);
    });
});
