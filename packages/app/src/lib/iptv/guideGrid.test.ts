import { describe, expect, test } from "bun:test";
import { buildGuideRows, getNowLinePercent } from "./guideGrid";
import { parseXmltv } from "./xmltv";
import type { IptvChannel } from "./types";

const channel = (overrides: Partial<IptvChannel>): IptvChannel => ({
    id: "source-1:0:test",
    sourceId: "source-1",
    name: "Test Channel",
    url: "stream-one",
    group: "News",
    order: 0,
    ...overrides,
});

describe("guide grid layout", () => {
    const viewportStart = new Date("2026-06-22T23:00:00.000Z");
    const viewportEnd = new Date("2026-06-23T00:00:00.000Z");
    const now = new Date("2026-06-22T23:15:00.000Z");

    test("positions current and future programmes against a shared time viewport", () => {
        const guide = parseXmltv(`<tv>
  <channel id="abc.us"><display-name>ABC News</display-name></channel>
  <programme channel="abc.us" start="20260622190000 -0400" stop="20260622193000 -0400"><title>ABCNL Prime</title></programme>
  <programme channel="abc.us" start="20260622193000 -0400" stop="20260622200000 -0400"><title>All Good</title></programme>
</tv>`);

        const [row] = buildGuideRows(
            [channel({ tvgId: "abc.us", name: "ABC News" })],
            guide,
            { viewportStart, viewportEnd, now },
        );

        expect(row.channel.name).toBe("ABC News");
        expect(row.programmes.map((programme) => programme.title)).toEqual([
            "ABCNL Prime",
            "All Good",
        ]);
        expect(row.programmes[0]).toMatchObject({
            leftPercent: 0,
            widthPercent: 50,
            state: "current",
            timeRange: "7:00 PM-7:30 PM",
        });
        expect(row.programmes[1]).toMatchObject({
            leftPercent: 50,
            widthPercent: 50,
            state: "future",
            timeRange: "7:30 PM-8:00 PM",
        });
        expect(getNowLinePercent({ viewportStart, viewportEnd, now })).toBe(25);
    });

    test("clips long currently-airing programmes to the visible viewport", () => {
        const guide = parseXmltv(`<tv>
  <channel id="weather"><display-name>AccuWeather</display-name></channel>
  <programme channel="weather" start="20260622160000 -0400" stop="20260622200000 -0400"><title>AccuWeather Ahead</title></programme>
</tv>`);

        const [row] = buildGuideRows(
            [channel({ tvgName: "AccuWeather", name: "AccuWeather" })],
            guide,
            { viewportStart, viewportEnd, now },
        );

        expect(row.programmes).toHaveLength(1);
        expect(row.programmes[0]).toMatchObject({
            title: "AccuWeather Ahead",
            leftPercent: 0,
            widthPercent: 100,
            startsBeforeViewport: true,
            endsAfterViewport: false,
            state: "current",
        });
    });

    test("falls back to normalized channel display-name matching", () => {
        const guide = parseXmltv(`<tv>
  <channel id="cnn"><display-name>CNN International</display-name></channel>
  <programme channel="cnn" start="20260622190000 -0400" stop="20260622200000 -0400"><title>Live: Erin Burnett OutFront</title></programme>
</tv>`);

        const [row] = buildGuideRows(
            [channel({ name: "cnn international" })],
            guide,
            { viewportStart, viewportEnd, now },
        );

        expect(row.programmes.map((programme) => programme.title)).toEqual([
            "Live: Erin Burnett OutFront",
        ]);
    });
});
