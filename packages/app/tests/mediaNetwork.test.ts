import { describe, expect, test } from "bun:test";
import { ALL_FORMATS, BufferSource, Input } from "mediabunny";
import { listMatroskaAudioTracks } from "../src/lib/media/containerTracks";
import { mapContainerCodec } from "../src/lib/media/codecSupport";
import {
	canRemuxOrTranscodeAudio,
	createRemoteUrlSource,
	preferredAudioIndex,
} from "../src/lib/media/probe";
import {
	ensureAudioDecoderRegistered,
	ensureMediaCodersRegistered,
} from "../src/lib/media/registerCoders";
import { needsFfmpegAudio } from "../src/lib/media/ffmpegPlayback";

describe("MediaBunny network lifecycle", () => {
	test("aborts active UrlSource fetches with the owning pipeline", async () => {
		const pipelineAbort = new AbortController();
		let requestSignal: AbortSignal | null = null;
		const source = createRemoteUrlSource("https://media.example/video.mkv", {
			signal: pipelineAbort.signal,
			fetchFn: ((_input, init) =>
				new Promise<Response>((_resolve, reject) => {
					requestSignal = init?.signal ?? null;
					requestSignal?.addEventListener(
						"abort",
						() => reject(new DOMException("Aborted", "AbortError")),
						{ once: true },
					);
				})) as typeof fetch,
		});
		const sourceFetch = (
			source as unknown as {
				_options: { fetchFn: typeof fetch };
			}
		)._options.fetchFn;

		const request = sourceFetch("https://media.example/video.mkv", {
			signal: new AbortController().signal,
		});
		pipelineAbort.abort();

		expect(requestSignal?.aborted).toBe(true);
		await expect(request).rejects.toMatchObject({ name: "AbortError" });
	});

	test("keeps MediaBunny cancellation connected after response headers arrive", async () => {
		const pipelineAbort = new AbortController();
		const requestAbort = new AbortController();
		let requestSignal: AbortSignal | null = null;
		const source = createRemoteUrlSource("https://media.example/video.mkv", {
			signal: pipelineAbort.signal,
			fetchFn: (async (_input, init) => {
				requestSignal = init?.signal ?? null;
				return new Response(new Uint8Array(64), { status: 206 });
			}) as typeof fetch,
		});
		const sourceFetch = (
			source as unknown as {
				_options: { fetchFn: typeof fetch };
			}
		)._options.fetchFn;

		await sourceFetch("https://media.example/video.mkv", {
			signal: requestAbort.signal,
		});
		requestAbort.abort();

		expect(requestSignal?.aborted).toBe(true);
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
	test("recognizes and decodes DTS from the playback fixture", async () => {
		ensureMediaCodersRegistered();
		const fixture = await Bun.file(
			new URL("../../../apps/desktop/tests/fixtures/h264-aac-dts.mkv", import.meta.url),
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
		};

		expect(needsFfmpegAudio(meta)).toBe(false);
		expect(needsFfmpegAudio(meta, 0)).toBe(false);
		expect(needsFfmpegAudio(meta, 1)).toBe(true);
	});
});
