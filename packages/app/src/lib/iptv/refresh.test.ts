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
});
