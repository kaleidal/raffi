import { describe, expect, test } from "bun:test";
import { BufferTarget, MkvOutputFormat, Output, TextSubtitleSource } from "mediabunny";
import { EmbeddedSubtitles } from "../../src/lib/media/subtitles/embeddedSubtitles";

const CUE_COUNT = 400;

async function buildMatroskaWithSubtitles() {
	const target = new BufferTarget();
	const output = new Output({ format: new MkvOutputFormat(), target });
	const subtitles = new TextSubtitleSource("webvtt");
	output.addSubtitleTrack(subtitles, { languageCode: "eng" });
	await output.start();
	const cues = Array.from({ length: CUE_COUNT }, (_, index) => {
		const start = index * 1.5;
		const format = (seconds: number) => new Date(seconds * 1000).toISOString().slice(11, 23);
		return `${format(start)} --> ${format(start + 1)}\nLine ${index}`;
	});
	await subtitles.add(`WEBVTT\n\n${cues.join("\n\n")}\n`);
	subtitles.close();
	await output.finalize();
	return new Uint8Array(target.buffer!);
}

function chunked(bytes: Uint8Array, seed: number) {
	let state = seed;
	const random = () => {
		state = (state * 1103515245 + 12345) % 2 ** 31;
		return state / 2 ** 31;
	};
	return new ReadableStream<Uint8Array>({
		start(controller) {
			let offset = 0;
			while (offset < bytes.byteLength) {
				const size = 1 + Math.floor(random() * 4096);
				controller.enqueue(bytes.subarray(offset, offset + size));
				offset += size;
			}
			controller.close();
		},
	});
}

async function stream(subtitles: EmbeddedSubtitles, bytes: Uint8Array, start: number, end: number, seed = 1) {
	const observed = subtitles.observe(start, chunked(bytes.subarray(start, end), seed));
	const passed = new Uint8Array(await new Response(observed).arrayBuffer());
	await new Promise((resolve) => setTimeout(resolve, 0));
	return passed;
}

describe("Embedded Matroska subtitles", () => {
	test("reads every cue while passing the bytes through unchanged", async () => {
		const file = await buildMatroskaWithSubtitles();
		const subtitles = new EmbeddedSubtitles();

		const passed = await stream(subtitles, file, 0, file.byteLength);

		expect(passed).toEqual(file);
		expect(subtitles.tracks).toEqual([
			{ number: 1, language: "eng", name: null, isDefault: true, isForced: false },
		]);
		const cues = subtitles.cuesFor(1);
		expect(cues).toHaveLength(CUE_COUNT);
		expect(cues[123]).toEqual({ start: 184.5, end: 185.5, text: "Line 123" });
	});

	test("resumes a read that continues in a later response", async () => {
		const file = await buildMatroskaWithSubtitles();
		const subtitles = new EmbeddedSubtitles();
		const split = Math.floor(file.byteLength * 0.37);

		await stream(subtitles, file, 0, split, 7);
		await stream(subtitles, file, split, file.byteLength, 9);

		expect(subtitles.cuesFor(1)).toHaveLength(CUE_COUNT);
	});

	test("finds cues after seeking into the middle of the file", async () => {
		const file = await buildMatroskaWithSubtitles();
		const subtitles = new EmbeddedSubtitles();
		await stream(subtitles, file, 0, 4096);
		const fromHeaders = new Set(subtitles.cuesFor(1).map((cue) => cue.text));

		await stream(subtitles, file, Math.floor(file.byteLength * 0.6), file.byteLength, 3);

		const found = subtitles.cuesFor(1).filter((cue) => !fromHeaders.has(cue.text));
		expect(found.length).toBeGreaterThan(10);
		expect(found.at(-1)?.text).toBe(`Line ${CUE_COUNT - 1}`);
		const gaps = found.slice(1).filter((cue, index) => cue.start - found[index]!.start !== 1.5);
		expect(gaps).toEqual([]);
	});

	test("leaves other containers untouched", async () => {
		const mp4Header = new Uint8Array([0, 0, 0, 32, 0x66, 0x74, 0x79, 0x70, ...new Array(4096).fill(7)]);
		const subtitles = new EmbeddedSubtitles();

		const passed = await stream(subtitles, mp4Header, 0, mp4Header.byteLength);

		expect(passed).toEqual(mp4Header);
		expect(subtitles.tracks).toEqual([]);
	});
});
