import { afterEach, describe, expect, test } from "bun:test";
import { iptvFetchText } from "./fetch";

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
});

describe("iptvFetchText", () => {
    test("cancels streamed browser responses when maxBytes is exceeded", async () => {
        const encoder = new TextEncoder();
        let readCount = 0;
        let canceled = false;
        const stream = new ReadableStream<Uint8Array>({
            pull(controller) {
                readCount += 1;
                controller.enqueue(encoder.encode(readCount === 1 ? "12345" : "67890"));
            },
            cancel() {
                canceled = true;
            },
        });

        globalThis.fetch = async () => new Response(stream, { status: 200 });

        await expect(
            iptvFetchText("https://iptv.example.test/playlist.m3u", { maxBytes: 6 }),
        ).rejects.toThrow("IPTV response exceeded maximum size");
        expect(readCount).toBeGreaterThanOrEqual(2);
        expect(canceled).toBe(true);
    });
});
