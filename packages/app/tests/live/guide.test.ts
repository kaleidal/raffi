import { describe, expect, test } from "bun:test";
import { createGuideReader, parseGuideTime } from "../../src/lib/live/parse/xmltv";
import { readText } from "../../src/lib/live/parse/streams";
import type { LiveChannel } from "../../src/lib/live/types";

const channel = (id: string, extra: Partial<LiveChannel> = {}): LiveChannel => ({ id, name: id, url: `http://${id}`, group: "All", ...extra });

const GUIDE = `<?xml version="1.0" encoding="UTF-8"?>
<tv generator-info-name="test">
  <channel id="BBC1.uk"><display-name>BBC One</display-name></channel>
  <channel id="itv.uk"><display-name lang="en">ITV 1 HD</display-name></channel>
  <channel id="unused"><display-name>Nobody Watches</display-name></channel>
  <programme start="20260101180000 +0000" stop="20260101190000 +0000" channel="BBC1.uk"><title>News &amp; Weather</title><desc><![CDATA[Headlines <live>]]></desc></programme>
  <programme start="20260101190000 +0000" stop="20260101200000 +0000" channel="BBC1.uk"><title>Drama</title></programme>
  <programme start="20260101183000 +0100" stop="20260101193000 +0100" channel="itv.uk"><title>Quiz</title></programme>
  <programme start="20260101180000 +0000" stop="20260101190000 +0000" channel="unused"><title>Skipped</title></programme>
  <programme start="20260105180000 +0000" stop="20260105190000 +0000" channel="BBC1.uk"><title>Too late</title></programme>
</tv>`;

const window = { from: Date.UTC(2026, 0, 1, 0), until: Date.UTC(2026, 0, 2, 0) };

describe("XMLTV guides", () => {
	test("reads offsets, and treats times without one as UTC", () => {
		expect(parseGuideTime("20260101183000 +0100")).toBe(Date.UTC(2026, 0, 1, 17, 30));
		expect(parseGuideTime("202601011830")).toBe(Date.UTC(2026, 0, 1, 18, 30));
	});

	test("matches channels by id or name and keeps only their programmes in the window, however the text is split", () => {
		const channels = [channel("bbc", { tvgId: "bbc1.uk" }), channel("itv", { name: "ITV 1 HD" }), channel("none")];
		const reader = createGuideReader(channels, window);
		for (let index = 0; index < GUIDE.length; index += 7) reader.chunk(GUIDE.slice(index, index + 7));
		const guides = reader.finish();

		expect(channels.map((entry) => entry.guideId)).toEqual(["BBC1.uk", "itv.uk", undefined]);
		expect([...guides.keys()].sort()).toEqual(["BBC1.uk", "itv.uk"]);
		expect(guides.get("BBC1.uk")!.map((programme) => programme.title)).toEqual(["News & Weather", "Drama"]);
		expect(guides.get("BBC1.uk")![0].description).toBe("Headlines <live>");
		expect(guides.get("itv.uk")![0].start).toBe(Date.UTC(2026, 0, 1, 17, 30));
	});

	test("matches ids and names that differ only in punctuation or quality tags", () => {
		const channels = [channel("itv", { tvgId: "ITV1.uk" }), channel("five", { name: "Channel 5" })];
		const reader = createGuideReader(channels, window);
		reader.chunk(`<tv><channel id="ITV1.HD.uk"/><channel id="c5"><display-name>Channel 5 HD</display-name></channel></tv>`);
		reader.finish();
		expect(channels.map((entry) => entry.guideId)).toEqual(["ITV1.HD.uk", "c5"]);
	});

	test("keeps the first guide's programmes when a later one covers the same channel", () => {
		const channels = [channel("bbc", { tvgId: "bbc1.uk" })];
		const reader = createGuideReader(channels, window);
		reader.chunk(GUIDE);
		reader.nextDocument();
		reader.chunk(GUIDE.replaceAll("Drama", "Repeat"));
		expect(reader.finish().get("BBC1.uk")!.map((programme) => programme.title)).toEqual(["News & Weather", "Drama"]);
	});

	test("rejects documents that aren't guides", () => {
		const reader = createGuideReader([], window);
		reader.chunk("<html><body>Not found</body></html>");
		expect(() => reader.finish()).toThrow();
	});

	test("reads gzipped guides without being told they are compressed", async () => {
		const zipped = Bun.gzipSync(new TextEncoder().encode(GUIDE));
		let text = "";
		await readText(new Blob([zipped]).stream(), (chunk) => (text += chunk));
		expect(text).toBe(GUIDE);
	});
});
