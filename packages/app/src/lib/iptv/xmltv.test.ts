import { describe, expect, test } from "bun:test";
import type { IptvChannel } from "./types";
import { getNowNext, parseXmltv } from "./xmltv";

const channel = (overrides: Partial<IptvChannel>): IptvChannel => ({
    id: "source-1:0:test",
    sourceId: "source-1",
    name: "Test Channel",
    url: "stream-one",
    group: "News",
    order: 0,
    ...overrides,
});

describe("parseXmltv", () => {
    test("parses XMLTV channels and timezone programme windows", () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <channel id="abc.us">
    <display-name>ABC</display-name>
    <display-name>ABC HD</display-name>
  </channel>
  <programme channel="abc.us" start="20260622090000 -0400" stop="20260622100000 -0400">
    <title>Morning News &amp; Weather</title>
    <sub-title>Local</sub-title>
    <desc>Headlines &amp; forecast.</desc>
  </programme>
</tv>`;

        const guide = parseXmltv(xml);
        const programmes = guide.programmesByChannel.get("abc.us") ?? [];

        expect(guide.channels.get("abc.us")?.displayNames).toEqual(["ABC", "ABC HD"]);
        expect(programmes).toHaveLength(1);
        expect(programmes[0].title).toBe("Morning News & Weather");
        expect(programmes[0].subTitle).toBe("Local");
        expect(programmes[0].description).toBe("Headlines & forecast.");
        expect(programmes[0].start.toISOString()).toBe("2026-06-22T13:00:00.000Z");
    });

    test("parses single-quoted XMLTV attributes", () => {
        const xml = `<tv>
  <channel id='abc.us'><display-name>ABC</display-name></channel>
  <programme channel='abc.us' start='20260622090000 -0400' stop='20260622100000 -0400'>
    <title>Morning News</title>
  </programme>
</tv>`;

        const guide = parseXmltv(xml);
        const programmes = guide.programmesByChannel.get("abc.us") ?? [];

        expect(guide.channels.get("abc.us")?.displayNames).toEqual(["ABC"]);
        expect(programmes).toHaveLength(1);
        expect(programmes[0].title).toBe("Morning News");
    });

    test("parses CDATA text inside XMLTV tags", () => {
        const xml = `<tv>
  <channel id="abc.us"><display-name><![CDATA[ABC <East>]]></display-name></channel>
  <programme channel="abc.us" start="20260622090000 -0400" stop="20260622100000 -0400">
    <title><![CDATA[Morning <News> & Weather]]></title>
    <desc><![CDATA[Headlines <local> & forecast.]]></desc>
  </programme>
</tv>`;

        const guide = parseXmltv(xml);
        const programmes = guide.programmesByChannel.get("abc.us") ?? [];

        expect(guide.channels.get("abc.us")?.displayNames).toEqual(["ABC <East>"]);
        expect(programmes[0].title).toBe("Morning <News> & Weather");
        expect(programmes[0].description).toBe("Headlines <local> & forecast.");
    });
});

describe("getNowNext", () => {
    const xml = `<tv>
  <channel id="abc.us"><display-name>ABC</display-name></channel>
  <channel id="weather"><display-name>Weather Now</display-name></channel>
  <channel id="sports"><display-name>Sports Plus</display-name></channel>
  <programme channel="abc.us" start="20260622090000 -0400" stop="20260622100000 -0400"><title>ABC Now</title></programme>
  <programme channel="abc.us" start="20260622100000 -0400" stop="20260622110000 -0400"><title>ABC Next</title></programme>
  <programme channel="weather" start="20260622090000 -0400" stop="20260622100000 -0400"><title>Weather Now</title></programme>
  <programme channel="sports" start="20260622090000 -0400" stop="20260622100000 -0400"><title>Sports Now</title></programme>
</tv>`;

    const at = new Date("2026-06-22T13:30:00.000Z");
    const guide = parseXmltv(xml);

    test("matches by exact tvg-id first", () => {
        const result = getNowNext(channel({ tvgId: "abc.us", tvgName: "Wrong Name" }), guide, at);

        expect(result.now?.title).toBe("ABC Now");
        expect(result.next?.title).toBe("ABC Next");
    });

    test("matches by tvg-name display name", () => {
        const result = getNowNext(channel({ tvgName: "Weather Now", name: "Weather 1" }), guide, at);

        expect(result.now?.channelId).toBe("weather");
        expect(result.now?.title).toBe("Weather Now");
    });

    test("matches by normalized display name fallback", () => {
        const result = getNowNext(channel({ name: "sports-plus" }), guide, at);

        expect(result.now?.channelId).toBe("sports");
        expect(result.now?.title).toBe("Sports Now");
    });
});
