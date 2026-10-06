import { isRetryableStatus, streamRetryDelay } from "../probe/streamFetch";

class RangeRefusedError extends Error {}

async function requestRange(src: string, start: number, end: number, signal: AbortSignal) {
	const response = await fetch(src, { headers: { Range: `bytes=${start}-${end - 1}` }, signal });
	if (response.status === 206) return new Uint8Array(await response.arrayBuffer());
	void response.body?.cancel().catch(() => {});
	if (isRetryableStatus(response.status)) throw new Error(`Stream host responded with ${response.status}`);
	throw new RangeRefusedError(`Range request answered with ${response.status}`);
}

async function fetchRange(src: string, start: number, end: number, signal: AbortSignal) {
	for (let attempt = 1; ; attempt++) {
		try {
			return await requestRange(src, start, end, signal);
		} catch (error) {
			const delay = signal.aborted || error instanceof RangeRefusedError ? null : streamRetryDelay(attempt);
			if (delay === null) throw error;
			await new Promise((resolve) => setTimeout(resolve, delay * 1000));
		}
	}
}

/**
 * Reads exact byte ranges of a remote file, keeping the last response as a window so
 * nearby reads are served without another request.
 */
export class RangeReader {
	private windowStart = 0;
	private window = new Uint8Array();

	constructor(
		readonly src: string,
		private readonly signal: AbortSignal,
	) {}

	async read(start: number, end: number, readAhead = 0): Promise<Uint8Array> {
		const offset = start - this.windowStart;
		if (offset >= 0 && end - this.windowStart <= this.window.byteLength) {
			return this.window.subarray(offset, end - this.windowStart);
		}
		const bytes = await fetchRange(this.src, start, Math.max(end, start + readAhead), this.signal);
		if (bytes.byteLength < end - start) throw new Error("Range response ended early");
		this.windowStart = start;
		this.window = bytes;
		return bytes.subarray(0, end - start);
	}
}
