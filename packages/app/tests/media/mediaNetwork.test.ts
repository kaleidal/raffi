import { describe, expect, test } from "bun:test";
import { ALL_FORMATS, BufferSource, Input } from "mediabunny";
import { listMatroskaAudioTracks } from "../../src/lib/media/probe/containerTracks";
import { mapContainerCodec } from "../../src/lib/media/probe/codecSupport";
import {
	canRemuxOrTranscodeAudio,
	formatAudioTrackLabel,
	preferredAudioIndex,
	probeRemoteStream,
} from "../../src/lib/media/probe/probe";
import {
	ensureAudioDecoderRegistered,
	ensureMediaCodersRegistered,
} from "../../src/lib/media/registerCoders";
import { needsFfmpegAudio } from "../../src/lib/media/playback/ffmpegPlayback";

describe("MediaBunny network lifecycle", () => {
	test("rejects a probe whose signal was already canceled", async () => {
		const abortController = new AbortController();
		abortController.abort();

		await expect(
			probeRemoteStream("https://media.example/video.mkv", abortController.signal),
		).rejects.toMatchObject({ name: "AbortError" });
	});

	test("uses the first range response for size instead of issuing HEAD", async () => {
		const originalFetch = globalThis.fetch;
		const methods: Array<string | undefined> = [];
		const ranges: Array<string | null> = [];
		globalThis.fetch = (async (_input, init) => {
			methods.push(init?.method);
			ranges.push(new Headers(init?.headers).get("range"));
			return new Response(new Uint8Array(64), {
				status: 206,
				headers: {
					"Content-Range": "bytes 0-63/1024",
				},
			});
		}) as typeof fetch;

		try {
			await listMatroskaAudioTracks("https://media.example/video.mkv");
		} finally {
			globalThis.fetch = originalFetch;
		}

		expect(methods).toEqual([undefined]);
		expect(ranges).toEqual(["bytes=0-63"]);
	});
});

describe("MediaBunny audio planning", () => {
	test("labels audio tracks by language without titles or codecs", () => {
		expect(formatAudioTrackLabel({
			index: 0,
			title: "Sony Sci-Fi",
			language: "jpn",
			codecName: "A_DTS",
		})).toBe("Japanese");
		expect(formatAudioTrackLabel({
			index: 1,
			title: "English DTS",
			language: "eng",
			codecName: "A_DTS",
		})).toBe("English");
		expect(formatAudioTrackLabel({
			index: 2,
			title: "Commentary",
			language: null,
			codecName: "A_AAC",
		})).toBe("Unknown");
	});

	test("recognizes and decodes DTS from the playback fixture", async () => {
		ensureMediaCodersRegistered();
		const fixture = await Bun.file(
			new URL("../../../../apps/desktop/tests/fixtures/h264-aac-dts.mkv", import.meta.url),
		).bytes();
		const input = new Input({
			source: new BufferSource(fixture),
			formats: ALL_FORMATS,
		});

		try {
			const tracks = await input.getAudioTracks();
			const codecs = await Promise.all(tracks.map((track) => track.getCodec()));
			const dtsTrack = tracks[codecs.indexOf("dts")];
			expect(dtsTrack).toBeDefined();
			await ensureAudioDecoderRegistered("dts");
			expect(await dtsTrack!.canDecode()).toBe(true);
			expect(mapContainerCodec("A_DTS")).toBe("dts");
		} finally {
			input.dispose();
		}
	});

	test("accepts DTS when its decoder is available and selects it by language", () => {
		expect(canRemuxOrTranscodeAudio(null, false)).toBe(false);
		expect(canRemuxOrTranscodeAudio("aac", false)).toBe(true);
		expect(canRemuxOrTranscodeAudio("ac3", true)).toBe(true);
		expect(canRemuxOrTranscodeAudio("dts", true)).toBe(true);

		const selected = preferredAudioIndex([
			{
				index: 4,
				codec: "dts",
				codecName: "A_DTS",
				language: "eng",
				title: null,
				channels: 6,
				playable: true,
				bunnyIndex: 0,
			},
			{
				index: 9,
				codec: "aac",
				codecName: "A_AAC",
				language: "jpn",
				title: null,
				channels: 2,
				playable: true,
				bunnyIndex: 1,
			},
		]);

		expect(selected).toBe(4);
	});

	test("uses FFmpeg only when the selected audio track needs it", () => {
		const audioTracks = [
			{
				index: 0,
				codec: "aac" as const,
				codecName: "AAC",
				language: "eng",
				title: null,
				channels: 2,
				playable: true,
				bunnyIndex: 0,
			},
			{
				index: 1,
				codec: null,
				codecName: "TRUEHD",
				language: "eng",
				title: null,
				channels: 8,
				playable: false,
				bunnyIndex: null,
			},
		];
		const meta = {
			durationSeconds: 3600,
			video: null,
			audio: null,
			audioTracks,
			preferredAudioIndex: 0,
			subtitleTracks: [],
		};

		expect(needsFfmpegAudio(meta)).toBe(false);
		expect(needsFfmpegAudio(meta, 0)).toBe(false);
		expect(needsFfmpegAudio(meta, 1)).toBe(true);
	});
});
