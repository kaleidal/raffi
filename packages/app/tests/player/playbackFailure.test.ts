import { describe, expect, test } from "bun:test";
import { describePlaybackFailure, streamConnectionFailure } from "../../src/pages/player/session/playbackFailure";

describe("describePlaybackFailure", () => {
	test("identifies a browser fetch failure as a likely network block", () => {
		expect(
			describePlaybackFailure({
				reason: "probe-failed",
				error: "TypeError: Failed to fetch",
			}),
		).toEqual(streamConnectionFailure());
	});

	test("preserves a specific codec failure", () => {
		expect(
			describePlaybackFailure({
				reason: "unsupported-audio-codec",
				error: "MediaBunny cannot decode TrueHD audio on this platform.",
			}),
		).toEqual({
			title: "Stream is not playable",
			details: "MediaBunny cannot decode TrueHD audio on this platform.",
		});
	});

	test("does not mislabel invalid media as carrier blocking", () => {
		expect(
			describePlaybackFailure({
				reason: "probe-failed",
				error: "Invalid media header",
			}),
		).toEqual({
			title: "Stream is not playable",
			details: "Invalid media header",
		});
	});
});
