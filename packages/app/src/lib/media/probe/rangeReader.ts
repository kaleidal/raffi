import { isRetryableStatus, streamRetryDelay } from "./streamFetch";

class RangeRefusedError extends Error {}

async function requestRange(src: string, start: number, end: number, signal?: AbortSignal) {
	const response = await fetch(src, { headers: { Range: `bytes=${start}-${end - 1}` }, signal });
	if (response.status === 206) {
		const total = response.headers.get("content-range")?.match(/\/(\d+)\s*$/);
		return {
			bytes: new Uint8Array(await response.arrayBuffer()),
			size: total ? Number(total[1]) : null,
		};
	}
	void response.body?.cancel().catch(() => {});
	if (isRetryableStatus(response.status)) throw new Error(`Stream host responded with ${response.status}`);
	throw new RangeRefusedError(`Range request answered with ${response.status}`);
}

async function fetchRange(src: string, start: number, end: number, signal?: AbortSignal) {
	for (let attempt = 1; ; attempt++) {
		try {
			return await requestRange(src, start, end, signal);
		} catch (error) {
			const delay = signal?.aborted || error instanceof RangeRefusedError ? null : streamRetryDelay(attempt);
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
	/** Total file size, known after the first response. */
	size: number | null = null;

	constructor(
		readonly src: string,
		private readonly signal?: AbortSignal,
	) {}

	async read(start: number, requestedEnd: number, readAhead = 0): Promise<Uint8Array> {
		const end = Math.min(requestedEnd, this.size ?? requestedEnd);
		const offset = start - this.windowStart;
		if (offset >= 0 && end - this.windowStart <= this.window.byteLength) {
			return this.window.subarray(offset, end - this.windowStart);
		}
		const { bytes, size } = await fetchRange(this.src, start, Math.max(end, start + readAhead), this.signal);
		this.size ??= size;
		if (bytes.byteLength < end - start) throw new Error("Range response ended early");
		this.windowStart = start;
		this.window = bytes;
		return bytes.subarray(0, end - start);
	}
}
