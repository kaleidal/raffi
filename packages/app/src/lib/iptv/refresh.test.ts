import { describe, expect, test } from "bun:test";
import type { IptvSource } from "./types";
import { refreshIptvSource } from "./refresh";

const source: IptvSource = {
    id: "source-1",
    name: "Live",
    kind: "m3u",
    m3uUrl: "https://iptv.example.test/playlist.m3u",
    epgUrl: "https://iptv.example.test/guide.xml",
    createdAt: "2026-06-22T00:00:00.000Z",
    updatedAt: "2026-06-22T00:00:00.000Z",
};

function buildXtreamTestUrl(path: "get.php" | "xmltv.php", extraParams: Record<string, string> = {}) {
    const params = new URLSearchParams();
    params.set("username", "user@example");
    params.set("password", "p@ss word");
    for (const [key, value] of Object.entries(extraParams)) {
        params.set(key, value);
    }
    return `http://panel.example.test:8080/${path}?${params.toString()}`;
}

describe("refreshIptvSource", () => {
    test("fetches playlist and guide through an injected fetcher", async () => {
        const result = await refreshIptvSource(source, {
            now: () => new Date("2026-06-22T13:30:00.000Z"),
            fetchText: async (url) => {
                if (url === source.m3uUrl) {
                    return `#EXTM3U
#EXTINF:-1 tvg-id="abc.us" group-title="Local",ABC HD
stream-one
#EXTINF:-1 tvg-name="Weather Now" group-title="Weather",Weather
stream-two
`;
                }
                return `<tv>
  <channel id="abc.us"><display-name>ABC HD</display-name></channel>
  <programme channel="abc.us" start="20260622090000 -0400" stop="20260622100000 -0400"><title>ABC Now</title></programme>
  <programme channel="abc.us" start="20260622100000 -0400" stop="20260622110000 -0400"><title>ABC Next</title></programme>
</tv>`;
            },
        });

        expect(result.channels.map((channel) => channel.name)).toEqual(["ABC HD", "Weather"]);
        expect(result.groups.map((group) => group.name)).toEqual(["Local", "Weather"]);
        expect(result.stats).toMatchObject({
            channelCount: 2,
            groupCount: 2,
            programmeCount: 2,
        });
        expect(result.guide).toBeTruthy();
        expect(result.loadedAt).toBe("2026-06-22T13:30:00.000Z");
    });

    test("returns a friendly empty playlist error", async () => {
        await expect(
            refreshIptvSource(
                { ...source, epgUrl: undefined },
                {
                    fetchText: async () => "#EXTM3U\n",
                },
            ),
        ).rejects.toThrow("The IPTV playlist did not contain any channels");
    });

    test("wraps XMLTV parser failures with a friendly message", async () => {
        await expect(
            refreshIptvSource(source, {
                fetchText: async (url) =>
                    url === source.m3uUrl
                        ? `#EXTM3U
#EXTINF:-1,One
stream-one
`
                        : "<not-tv>",
            }),
        ).rejects.toThrow("The XMLTV guide could not be parsed");
    });

    test("fetches Xtream playlist and XMLTV guide from credentials", async () => {
        const xtreamSource: IptvSource = {
            id: "xtream-1",
            name: "Xtream Live",
            kind: "xtream",
            serverUrl: "http://panel.example.test:8080/",
            username: "user@example",
            credential: "p@ss word",
            createdAt: "2026-06-22T00:00:00.000Z",
            updatedAt: "2026-06-22T00:00:00.000Z",
        };
        const seenUrls: string[] = [];
        const playlistUrl = buildXtreamTestUrl("get.php", {
            type: "m3u_plus",
            output: "ts",
        });
        const guideUrl = buildXtreamTestUrl("xmltv.php");

        const result = await refreshIptvSource(xtreamSource, {
            now: () => new Date("2026-06-22T13:30:00.000Z"),
            fetchText: async (url) => {
                seenUrls.push(url);
                if (url === playlistUrl) {
                    return `#EXTM3U
#EXTINF:-1 tvg-id="news.us" group-title="News",News HD
http://panel.example.test:8080/live/user@example/p@ss word/123.ts
`;
                }
                if (url === guideUrl) {
                    return `<tv>
  <channel id="news.us"><display-name>News HD</display-name></channel>
  <programme channel="news.us" start="20260622090000 -0400" stop="20260622100000 -0400"><title>Morning News</title></programme>
</tv>`;
                }
                throw new Error(`Unexpected URL ${url}`);
            },
        });

        expect(seenUrls).toEqual([playlistUrl, guideUrl]);
        expect(result.channels.map((channel) => channel.name)).toEqual(["News HD"]);
        expect(result.groups.map((group) => group.name)).toEqual(["News"]);
        expect(result.stats).toMatchObject({
            channelCount: 1,
            groupCount: 1,
            programmeCount: 1,
        });
    });
});
