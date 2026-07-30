import { describe, expect, test } from "bun:test";
import {
	createSeekHandler,
	performSeek,
} from "../src/pages/player/videoSession";

class SeekableVideo extends EventTarget {
	paused = true;
	currentTime = 0;
	buffered = {
		length: 0,
		start: () => 0,
		end: () => 0,
	};
	playCalls = 0;
	pauseCalls = 0;

	pause() {
		this.pauseCalls += 1;
		this.paused = true;
	}

	async play() {
		this.playCalls += 1;
		this.paused = false;
	}
}

describe("createSeekHandler", () => {
	test("leaves direct playback active while the browser starts seeking", () => {
		const video = new SeekableVideo();
		video.paused = false;

		performSeek(
			120,
			1800,
			0,
			video as unknown as HTMLVideoElement,
			() => {},
			() => {},
			false,
			false,
			true,
			() => {},
			{
				setPendingSeek: () => {},
				setCurrentTime: () => {},
				setShowCanvas: () => {},
				setIgnoreNextSeek: () => {},
			},
		);

		expect(video.currentTime).toBe(120);
		expect(video.pauseCalls).toBe(0);
	});

	test("resumes direct playback and clears buffering after an unbuffered seek", async () => {
		const video = new SeekableVideo();
		let pendingSeek: number | null = 120;
		const buffering: boolean[] = [];
		const heldFrame: boolean[] = [];

		const handler = createSeekHandler(
			video as unknown as HTMLVideoElement,
			() => pendingSeek,
			() => false,
			() => 0,
			() => [],
			() => "Off",
			() => {},
			{
				setPendingSeek: (value) => {
					pendingSeek = value;
				},
				setSeekGuard: () => {},
				setBuffering: (value) => buffering.push(value),
				setShowCanvas: (value) => heldFrame.push(value),
				setFirstSeekLoad: () => {},
				setPlaybackOffset: () => {},
				setShowError: () => {},
				setErrorMessage: () => {},
				setErrorDetails: () => {},
			},
			() => null,
			() => true,
		);

		await handler();
		video.dispatchEvent(new Event("seeked"));
		await Promise.resolve();

		expect(video.currentTime).toBe(120);
		expect(video.playCalls).toBe(1);
		expect(buffering).toEqual([true, false]);
		expect(heldFrame).toEqual([true, false]);
	});
});
