import { describe, expect, test } from "bun:test";
import {
	canReuseNextEpisodePrefetch,
	type NextEpisodePrefetchHandoff,
} from "../src/pages/player/nextEpisodePrefetch";

const handoff = (mode: NextEpisodePrefetchHandoff["mode"]) =>
	({
		sessionData: {},
		src: "https://media.example/episode.mp4",
		fileIdx: null,
		mode,
		meta: null,
		mediaBunny: null,
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
});
