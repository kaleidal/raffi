import { afterEach, describe, expect, test } from "bun:test";
import {
	addLimboTorrent,
	assertLimboCompatible,
	checkLimboHealth,
	clearLimboDiscoveryCache,
	LimboApiError,
    LimboUnavailableError,
    parseLimboTorrentStatus,
} from "../src/lib/limbo/client";

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;

afterEach(() => {
	globalThis.fetch = originalFetch;
	globalThis.window = originalWindow;
	clearLimboDiscoveryCache();
});

const torrentStatus = {
	id: "torrent",
	infoHash: null,
	name: "Example",
	status: "downloading",
	stage: "metadata",
	progress: 0,
	downloadSpeed: 0,
	uploadSpeed: 0,
	peers: 0,
	seeds: 0,
	size: 0,
	downloaded: 0,
	files: [],
	selectedFileIndex: null,
	streamUrl: null,
	ready: false,
	contiguousBytes: 0,
	clientId: "raffi",
	lastError: null,
} as const;

describe("Limbo companion contract", () => {
    test("rejects the incomplete v1 API", () => {
        expect(() => assertLimboCompatible({ ok: true, apiVersion: 1 })).toThrow(
            LimboUnavailableError,
        );
    });

    test("rejects malformed status payloads instead of polling forever", () => {
        expect(() => parseLimboTorrentStatus({ id: "torrent", status: "downloading" })).toThrow(
            LimboApiError,
        );
    });

	test("accepts the v2 status shape", () => {
		const status = parseLimboTorrentStatus(torrentStatus);
		expect(status.stage).toBe("metadata");
	});

	test("preserves health request cancellation", async () => {
		const abortController = new AbortController();
		abortController.abort();
		globalThis.fetch = (async () => {
			throw abortController.signal.reason;
		}) as typeof fetch;

		await expect(checkLimboHealth(abortController.signal)).rejects.toMatchObject({
			name: "AbortError",
		});
	});

	test("recovers when a stopped secondary Limbo instance left stale discovery", async () => {
		globalThis.window = {
			electronAPI: {
				readLimboApiDiscovery: async () => ({
					baseUrl: "http://127.0.0.1:43025",
					token: "discovery-token",
				}),
			},
		} as unknown as Window & typeof globalThis;
		const requestedUrls: string[] = [];
		globalThis.fetch = (async (input) => {
			const url = String(input);
			requestedUrls.push(url);
			if (url.includes(":43025")) throw new TypeError("fetch failed");
			return Response.json({
				ok: true,
				service: "limbo",
				apiVersion: 2,
				torrentReady: true,
			});
		}) as typeof fetch;

		expect(await checkLimboHealth()).toMatchObject({ ok: true, service: "limbo" });
		expect(requestedUrls).toEqual([
			"http://127.0.0.1:43025/v1/health",
			"http://127.0.0.1:17890/v1/health",
		]);
	});

	test("removes a torrent created as approval cancellation wins the race", async () => {
		const abortController = new AbortController();
		let removed = false;
		globalThis.fetch = (async (input, init) => {
			const url = String(input);
			if (url.endsWith("/v1/health")) {
				return Response.json({
					ok: true,
					service: "limbo",
					apiVersion: 2,
					torrentReady: true,
				});
			}
			if (init?.method === "DELETE") {
				removed = true;
				return new Response(null, { status: 204 });
			}
			return {
				ok: true,
				json: async () => {
					abortController.abort();
					return torrentStatus;
				},
			} as Response;
		}) as typeof fetch;

		await expect(
			addLimboTorrent({ magnet: "magnet:?xt=urn:btih:example" }, abortController.signal),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(removed).toBe(true);
	});
});
