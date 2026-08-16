import { describe, expect, test } from "bun:test";
import {
	recordPlaybackStall,
	shouldSuggestAnotherStream,
} from "../src/pages/player/playbackHealth";

describe("playback health", () => {
	test("ignores brief and isolated buffering", () => {
		let stalls = recordPlaybackStall([], 900, 10_000);
		stalls = recordPlaybackStall(stalls, 2_000, 20_000);

		expect(shouldSuggestAnotherStream(stalls)).toBe(false);
	});

	test("suggests another stream after repeated costly stalls", () => {
		let stalls = recordPlaybackStall([], 2_000, 10_000);
		stalls = recordPlaybackStall(stalls, 2_000, 30_000);
		stalls = recordPlaybackStall(stalls, 2_500, 50_000);

		expect(shouldSuggestAnotherStream(stalls)).toBe(true);
	});

	test("drops stalls outside the rolling window", () => {
		let stalls = recordPlaybackStall([], 5_000, 10_000);
		stalls = recordPlaybackStall(stalls, 5_000, 110_001);

		expect(stalls).toHaveLength(1);
		expect(shouldSuggestAnotherStream(stalls)).toBe(false);
	});
});
