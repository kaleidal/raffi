import { describe, expect, test } from "bun:test";
import { listMatroskaAudioTracks } from "../src/lib/media/containerTracks";
import { createRemoteUrlSource } from "../src/lib/media/probe";

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
