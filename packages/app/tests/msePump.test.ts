import { describe, expect, test } from "bun:test";
import { pumpStreamToSourceBuffer } from "../src/lib/media/msePump";

function createTimeRanges(getRange: () => { start: number; end: number }) {
	return {
		get length() {
			return getRange().end > getRange().start ? 1 : 0;
		},
		start: () => getRange().start,
		end: () => getRange().end,
	} as TimeRanges;
}

describe("MSE stream pumping", () => {
	test("appends startup output before the regular batch threshold", async () => {
		let range = { start: 0, end: 0 };
		let closeStream = () => {};
		let markAppended = () => {};
		const appended = new Promise<void>((resolve) => {
			markAppended = resolve;
		});
		const buffered = createTimeRanges(() => range);
		const sourceBuffer = {
			updating: false,
			buffered,
			addEventListener: () => undefined,
			removeEventListener: () => undefined,
			appendBuffer: () => {
				range = { start: 0, end: 1 };
				markAppended();
			},
			remove: () => undefined,
		} as unknown as SourceBuffer;
		const readable = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new Uint8Array(1024));
				closeStream = () => controller.close();
			},
		});

		const pumping = pumpStreamToSourceBuffer(readable, sourceBuffer);
		await appended;
		closeStream();

		await expect(pumping).resolves.toBe("complete");
	});

	test("evicts consumed media and retries when Chromium's quota is full", async () => {
		let range = { start: 0, end: 60 };
		let appendAttempts = 0;
		const removals: Array<{ start: number; end: number }> = [];
		const buffered = createTimeRanges(() => range);
		const sourceBuffer = {
			updating: false,
			buffered,
			addEventListener: () => undefined,
			removeEventListener: () => undefined,
			appendBuffer: () => {
				appendAttempts += 1;
				if (appendAttempts === 1) {
					throw new DOMException("SourceBuffer is full", "QuotaExceededError");
				}
			},
			remove: (start: number, end: number) => {
				removals.push({ start, end });
				if (end >= range.end) range = { ...range, end: start };
				else if (start <= range.start) range = { ...range, start: end };
			},
		} as unknown as SourceBuffer;
		const video = {
			currentTime: 20,
			buffered,
			addEventListener: () => undefined,
			removeEventListener: () => undefined,
		} as unknown as HTMLVideoElement;
		const readable = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new Uint8Array(256 * 1024));
				controller.close();
			},
		});

		await expect(
			pumpStreamToSourceBuffer(readable, sourceBuffer, undefined, video),
		).resolves.toBe("complete");
		expect(appendAttempts).toBe(2);
		expect(removals).toEqual([{ start: 0, end: 18 }]);
	});
});
