import { describe, expect, test } from "bun:test";
import {
	createSeekHandler,
	performSeek,
} from "../src/pages/player/session/videoSession";

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

		performSeek({
			targetTime: 120,
			duration: 1800,
			videoElem: video as unknown as HTMLVideoElement,
			captureFrame: () => {},
			onAfterSeek: () => {},
			isWatchPartyHost: false,
			isPlaying: true,
			updatePlaybackState: () => {},
			setPendingSeek: () => {},
			setCurrentTime: () => {},
			setShowCanvas: () => {},
			hasPlaybackController: false,
		});

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
			{
				setPendingSeek: (value) => {
					pendingSeek = value;
				},
				setSeekGuard: () => {},
				setBuffering: (value) => buffering.push(value),
				setShowCanvas: (value) => heldFrame.push(value),
				setFirstSeekLoad: () => {},
				setShowError: () => {},
				setErrorMessage: () => {},
				setErrorDetails: () => {},
			},
			() => null,
			() => true,
		);

		await handler();
		expect(video.pauseCalls).toBe(0);
		video.dispatchEvent(new Event("seeked"));
		await Promise.resolve();

		expect(video.currentTime).toBe(120);
		expect(video.playCalls).toBe(1);
		expect(buffering).toEqual([true, false]);
		expect(heldFrame).toEqual([true, false]);
	});

	test("releases a direct seek when the browser never emits seeked", async () => {
		const video = new SeekableVideo();
		video.paused = false;
		let pendingSeek: number | null = 120;
		let seekGuard = false;
		let buffering = false;
		let heldFrame = false;
		let showedError = false;

		const handler = createSeekHandler(
			video as unknown as HTMLVideoElement,
			() => pendingSeek,
			() => seekGuard,
			{
				setPendingSeek: (value) => {
					pendingSeek = value;
				},
				setSeekGuard: (value) => {
					seekGuard = value;
				},
				setBuffering: (value) => {
					buffering = value;
				},
				setShowCanvas: (value) => {
					heldFrame = value;
				},
				setFirstSeekLoad: () => {},
				setShowError: (value) => {
					showedError = value;
				},
				setErrorMessage: () => {},
				setErrorDetails: () => {},
			},
			() => null,
			() => true,
			1,
		);

		await handler();
		await Bun.sleep(5);

		expect(seekGuard).toBe(false);
		expect(buffering).toBe(false);
		expect(heldFrame).toBe(false);
		expect(showedError).toBe(false);
		expect(video.pauseCalls).toBe(0);
	});
});
