import { describe, expect, test } from "bun:test";

const {
	createLocalMediaProtocolHandler,
} = await import("../electron/services/localMediaProtocol.cjs");

describe("remote media protocol", () => {
	test("forwards range headers and request cancellation", async () => {
		let handler: ((request: Request) => Promise<Response>) | null = null;
		let upstreamUrl = "";
		let upstreamInit: RequestInit | null = null;
		const controller = new AbortController();

		createLocalMediaProtocolHandler({
			protocol: {
				handle: (_scheme: string, nextHandler: typeof handler) => {
					handler = nextHandler;
				},
			},
			net: {
				fetch: async (url: string, init: RequestInit) => {
					upstreamUrl = url;
					upstreamInit = init;
					return new Response(new Uint8Array([1, 2, 3]), {
						status: 206,
						headers: {
							"Content-Range": "bytes 10-12/100",
						},
					});
				},
			},
		});

		const source = "https://media.example/video.mp4?token=signed";
		const request = new Request(
			`raffi-media://remote/?url=${encodeURIComponent(source)}`,
			{
				headers: {
					Range: "bytes=10-12",
					"If-Range": "\"version\"",
				},
				signal: controller.signal,
			},
		);
		const response = await handler!(request);

		expect(upstreamUrl).toBe(source);
		expect(new Headers(upstreamInit!.headers).get("range")).toBe("bytes=10-12");
		expect(new Headers(upstreamInit!.headers).get("if-range")).toBe("\"version\"");
		expect(upstreamInit!.signal).toBe(controller.signal);
		expect(response.status).toBe(206);
		expect(response.headers.get("access-control-allow-origin")).toBe("*");
	});
});
