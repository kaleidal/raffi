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
const RETAIN_BUFFER_BEHIND_SECONDS = 30;
const BUFFER_TRIM_HYSTERESIS_SECONDS = 5;

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
	video?: HTMLVideoElement | null,
): Promise<void> {
	await waitForSourceBufferIdle(sourceBuffer);
	if (signal?.aborted) {
		throw new DOMException("Aborted", "AbortError");
	}
	await trimOldBuffer(sourceBuffer, video, signal);
	const buffer = bytes.buffer.slice(
		bytes.byteOffset,
		bytes.byteOffset + bytes.byteLength,
	) as ArrayBuffer;
	try {
		sourceBuffer.appendBuffer(buffer);
	} catch (error) {
		if (!(error instanceof DOMException) || error.name !== "QuotaExceededError") {
			throw error;
		}
		await trimOldBuffer(sourceBuffer, video, signal, 5);
		sourceBuffer.appendBuffer(buffer);
	}
	await waitForSourceBufferIdle(sourceBuffer);
}

async function trimOldBuffer(
	sourceBuffer: SourceBuffer,
	video: HTMLVideoElement | null | undefined,
	signal?: AbortSignal,
	retainSeconds = RETAIN_BUFFER_BEHIND_SECONDS,
): Promise<void> {
	if (!video || sourceBuffer.buffered.length === 0) return;
	const removeEnd = video.currentTime - retainSeconds;
	if (removeEnd <= 0) return;
	const firstStart = sourceBuffer.buffered.start(0);
	if (removeEnd - firstStart < BUFFER_TRIM_HYSTERESIS_SECONDS) return;
	if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
	sourceBuffer.remove(0, removeEnd);
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
	video?: HTMLVideoElement | null,
	maxBufferAheadSeconds?: number,
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
		await appendBytes(sourceBuffer, bytes, signal, video);
	};

	try {
		while (true) {
			if (signal?.aborted) {
				throw new DOMException("Aborted", "AbortError");
			}
			if (
				maxBufferAheadSeconds != null &&
				getBufferedAheadSeconds(sourceBuffer, video ?? null) >= maxBufferAheadSeconds
			) {
				await waitForBufferCapacity(sourceBuffer, video, maxBufferAheadSeconds, signal);
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

function waitForBufferCapacity(
	sourceBuffer: SourceBuffer,
	video: HTMLVideoElement | null | undefined,
	limit: number,
	signal?: AbortSignal,
) {
	if (!video) return Promise.resolve();
	return new Promise<void>((resolve, reject) => {
		const finish = (error?: unknown) => {
			video.removeEventListener("timeupdate", check);
			signal?.removeEventListener("abort", handleAbort);
			if (error) reject(error);
			else resolve();
		};
		const check = () => {
			if (getBufferedAheadSeconds(sourceBuffer, video) <= limit * 0.4) finish();
		};
		const handleAbort = () => finish(new DOMException("Aborted", "AbortError"));
		video.addEventListener("timeupdate", check);
		signal?.addEventListener("abort", handleAbort, { once: true });
		if (signal?.aborted) handleAbort();
		else check();
	});
}

export function pickMseMimeType(
	videoCodecString: string | null,
	audioCodecString: string | null,
): string | null {
	const video = videoCodecString?.trim() || null;
	if (!video) return null;

	const audio = audioCodecString?.trim() || null;
	const codecs = audio ? `${video}, ${audio}` : video;
	const type = `video/mp4; codecs="${codecs}"`;
	return MediaSource.isTypeSupported(type) ? type : null;
}
