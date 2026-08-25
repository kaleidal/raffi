import { describe, expect, test } from "bun:test";
import {
	canReuseNextEpisodePrefetch,
	isSamePlaybackSource,
	type NextEpisodePrefetchHandoff,
} from "../src/pages/player/nextEpisodePrefetch";

const handoff = (mode: NextEpisodePrefetchHandoff["mode"]) =>
	({
		sessionData: {},
		src: "https://media.example/episode.mp4",
		fileIdx: null,
		mode,
		meta: null,
		playbackController: null,
		hls: null,
	}) satisfies NextEpisodePrefetchHandoff;

describe("canReuseNextEpisodePrefetch", () => {
	test("treats a different file in the same torrent as a new playback source", () => {
		const magnet = "magnet:?xt=urn:btih:episode-pack";
		expect(isSamePlaybackSource(magnet, 8, magnet, 7)).toBe(false);
		expect(isSamePlaybackSource(magnet, 8, magnet, 8)).toBe(true);
	});

	test("reuses directly seekable streams when the episode has saved progress", () => {
		expect(
			canReuseNextEpisodePrefetch(
				handoff("direct"),
				"https://media.example/episode.mp4",
				null,
				120,
			),
		).toBe(true);
	});

	test("keeps nonzero MediaBunny starts on the remux load path", () => {
		expect(
			canReuseNextEpisodePrefetch(
				handoff("mediabunny"),
				"https://media.example/episode.mp4",
				null,
				120,
			),
		).toBe(false);
	});

	test("hands off a prefetched FFmpeg stream at the episode start", () => {
		expect(
			canReuseNextEpisodePrefetch(
				handoff("ffmpeg"),
				"https://media.example/episode.mp4",
				null,
				0,
			),
		).toBe(true);
	});
});
