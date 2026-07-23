/** How far ahead of the playhead to remux before pausing the conversion. */
export const TARGET_BUFFER_AHEAD_SECONDS = 60;
/** Resume remux once buffered ahead drops to this. */
export const RESUME_BUFFER_AHEAD_SECONDS = 18;

export function waitForSourceBufferIdle(sourceBuffer: SourceBuffer): Promise<void> {
	if (!sourceBuffer.updating) return Promise.resolve();
	return new Promise((resolve, reject) => {
		const onUpdate = () => {
			cleanup();
			resolve();
		};
		const onError = () => {
			cleanup();
			reject(new Error("SourceBuffer update failed"));
		};
		const cleanup = () => {
			sourceBuffer.removeEventListener("updateend", onUpdate);
			sourceBuffer.removeEventListener("error", onError);
		};
		sourceBuffer.addEventListener("updateend", onUpdate);
		sourceBuffer.addEventListener("error", onError);
	});
}

const BATCH_BYTES = 256 * 1024;

function concatChunks(chunks: Uint8Array[], total: number): Uint8Array {
	if (chunks.length === 1) return chunks[0]!;
	const out = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return out;
}

async function appendBytes(
	sourceBuffer: SourceBuffer,
	bytes: Uint8Array,
	signal?: AbortSignal,
): Promise<void> {
	await waitForSourceBufferIdle(sourceBuffer);
	if (signal?.aborted) {
		throw new DOMException("Aborted", "AbortError");
	}
	sourceBuffer.appendBuffer(
		bytes.buffer.slice(
			bytes.byteOffset,
			bytes.byteOffset + bytes.byteLength,
		) as ArrayBuffer,
	);
	await waitForSourceBufferIdle(sourceBuffer);
}

export function getBufferedAheadSeconds(
	sourceBuffer: SourceBuffer,
	video: HTMLVideoElement | null,
): number {
	try {
		const buffered =
			video && video.buffered.length > 0 ? video.buffered : sourceBuffer.buffered;
		if (buffered.length === 0) return 0;
		const current = video?.currentTime ?? 0;
		for (let i = 0; i < buffered.length; i++) {
			const start = buffered.start(i);
			const end = buffered.end(i);
			if (current >= start - 0.35 && current <= end + 0.35) {
				return Math.max(0, end - current);
			}
		}
		return Math.max(0, buffered.end(buffered.length - 1) - current);
	} catch {
		return 0;
	}
}

/**
 * Pumps remuxed bytes into MSE until the stream ends or the signal aborts.
 * Backpressure comes from pausing Conversion.execute({ until }) — do not
 * cancel the reader early (that errors the writable and breaks cancel()).
 */
export async function pumpStreamToSourceBuffer(
	readable: ReadableStream<Uint8Array>,
	sourceBuffer: SourceBuffer,
	signal?: AbortSignal,
): Promise<"complete"> {
	const reader = readable.getReader();
	const pending: Uint8Array[] = [];
	let pendingSize = 0;

	const flush = async (force = false) => {
		if (pendingSize === 0) return;
		if (!force && pendingSize < BATCH_BYTES) return;
		const bytes = concatChunks(pending, pendingSize);
		pending.length = 0;
		pendingSize = 0;
		await appendBytes(sourceBuffer, bytes, signal);
	};

	try {
		while (true) {
			if (signal?.aborted) {
				throw new DOMException("Aborted", "AbortError");
			}
			const { done, value } = await reader.read();
			if (done) break;
			if (!value || value.byteLength === 0) continue;

			pending.push(value);
			pendingSize += value.byteLength;
			await flush(false);
		}
		await flush(true);
		return "complete";
	} finally {
		try {
			reader.releaseLock();
		} catch {
			// ignore
		}
	}
}

export function pickMseMimeType(
	videoCodecString: string | null,
	audioCodecString: string | null,
): string | null {
	const video = videoCodecString?.trim() || null;
	const audio = audioCodecString?.trim() || "mp4a.40.2";

	const candidates: string[] = [];
	if (video) {
		candidates.push(`video/mp4; codecs="${video}, ${audio}"`);
		candidates.push(`video/mp4; codecs="${video}"`);
	}
	candidates.push(`video/mp4; codecs="avc1.42E01E, ${audio}"`);
	candidates.push(`video/mp4; codecs="avc1.4D401F, mp4a.40.2"`);
	candidates.push("video/mp4");

	for (const type of candidates) {
		if (MediaSource.isTypeSupported(type)) return type;
	}
	return null;
}
