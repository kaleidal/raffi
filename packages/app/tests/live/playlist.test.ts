import { describe, expect, test } from "bun:test";
import { createPlaylistReader } from "../../src/lib/live/parse/m3u";

const read = (text: string) => {
	const reader = createPlaylistReader("src");
	for (const line of text.split("\n")) reader.line(line);
	return reader.finish();
};

describe("M3U playlists", () => {
	test("reads attributes, groups, headers and the playlist's own guide", () => {
		const { channels, groups, guideUrls } = read(`#EXTM3U url-tvg="https://epg.example/guide.xml.gz, https://other.example/b.xml"
#EXTINF:-1 tvg-id="bbc1.uk" tvg-name="BBC One" tvg-logo="https://logo/bbc.png" tvg-chno="101" group-title="UK, Main",BBC One HD
#EXTVLCOPT:http-user-agent=Player/1.0
#EXTVLCOPT:http-referrer=https://ref.example/
http://stream.example/bbc1.m3u8
#EXTINF:-1,No Attributes
#EXTGRP:News
http://stream.example/news.ts`);
		expect(guideUrls).toEqual(["https://epg.example/guide.xml.gz", "https://other.example/b.xml"]);
		expect(groups).toEqual(["UK, Main", "News"]);
		expect(channels[0]).toMatchObject({
			name: "BBC One HD",
			tvgId: "bbc1.uk",
			number: "101",
			group: "UK, Main",
			headers: { userAgent: "Player/1.0", referrer: "https://ref.example/" },
		});
		expect(channels[1]).toMatchObject({ name: "No Attributes", group: "News", headers: undefined });
	});

	test("keeps channel ids stable when the playlist is reordered, and unique when a stream repeats", () => {
		const first = read("#EXTINF:-1,A\nhttp://a\n#EXTINF:-1,B\nhttp://b").channels;
		const reordered = read("#EXTINF:-1,B\nhttp://b\n#EXTINF:-1,A\nhttp://a").channels;
		expect(first.find((channel) => channel.name === "A")!.id).toBe(reordered.find((channel) => channel.name === "A")!.id);
		const repeated = read("#EXTINF:-1,A\nhttp://a\n#EXTINF:-1,A again\nhttp://a").channels;
		expect(new Set(repeated.map((channel) => channel.id)).size).toBe(2);
	});
});
