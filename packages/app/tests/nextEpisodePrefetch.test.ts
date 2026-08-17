import { describe, expect, test } from "bun:test";
import {
	canReuseNextEpisodePrefetch,
	getPrefetchAudioIndex,
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

describe("getPrefetchAudioIndex", () => {
	test("lets FFmpeg recalculate the preferred track for unsupported audio", () => {
		expect(getPrefetchAudioIndex("ffmpeg", 9)).toBeUndefined();
	});

	test("keeps MediaBunny's probed preferred track", () => {
		expect(getPrefetchAudioIndex("mediabunny", 9)).toBe(9);
		expect(getPrefetchAudioIndex("mediabunny")).toBe(0);
	});
});
