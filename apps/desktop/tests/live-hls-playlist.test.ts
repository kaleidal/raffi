import { describe, expect, test } from "bun:test";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { isHlsPlaylist, rewriteHlsPlaylist } = require("../electron/services/live/hlsPlaylist.cjs");

const proxy = (url: string) => `proxy:${url}`;

describe("HLS playlists behind the live proxy", () => {
	test("tells HLS playlists from channel lists", () => {
		expect(isHlsPlaylist("#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:6")).toBe(true);
		expect(isHlsPlaylist("#EXTM3U\n#EXTINF:-1,Channel\nhttp://a/b.ts")).toBe(false);
	});

	test("resolves every link against where the playlist was served from and routes it back through the proxy", () => {
		const playlist = [
			"#EXTM3U",
			'#EXT-X-KEY:METHOD=AES-128,URI="key.bin"',
			'#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",URI="/audio/en.m3u8"',
			"#EXTINF:6.0,",
			"seg1.ts?token=1",
			"#EXTINF:6.0,",
			"https://cdn.example/seg2.ts",
		].join("\n");
		const rewritten = rewriteHlsPlaylist(playlist, "http://lb2.example:8080/live/a/b/index.m3u8?t=x", proxy).split("\n");
		expect(rewritten[1]).toBe('#EXT-X-KEY:METHOD=AES-128,URI="proxy:http://lb2.example:8080/live/a/b/key.bin"');
		expect(rewritten[2]).toBe('#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",URI="proxy:http://lb2.example:8080/audio/en.m3u8"');
		expect(rewritten[4]).toBe("proxy:http://lb2.example:8080/live/a/b/seg1.ts?token=1");
		expect(rewritten[6]).toBe("proxy:https://cdn.example/seg2.ts");
	});
});
