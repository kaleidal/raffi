import {
	ALL_FORMATS,
	BufferTarget,
	Conversion,
	Input,
	Mp4OutputFormat,
	Output,
	type AudioCodec,
	type VideoCodec,
} from "mediabunny";
import { createRemoteUrlSource } from "./probe";
import { ensureMediaCodersRegistered } from "./registerCoders";
import { toClientPlayableUrl } from "./localSource";

const MAX_CLIP_SECONDS = 15 * 60;

export type ClientClipRequest = {
	source: string;
	start: number;
	end: number;
	signal?: AbortSignal;
	onProgress?: (progress: number) => void;
};

export type ClientClipResult = {
	bytes: Uint8Array;
	mimeType: string;
};

/**
 * Remux/transcode a time range to fragmented MP4 in-process (no Go sidecar).
 */
export async function exportClipWithMediaBunny(
	req: ClientClipRequest,
): Promise<ClientClipResult> {
	ensureMediaCodersRegistered();

	const start = Math.max(0, req.start);
	const end = Math.max(start + 0.1, req.end);
	if (end - start > MAX_CLIP_SECONDS) {
		throw new Error(`Clip too long (max ${MAX_CLIP_SECONDS / 60} minutes)`);
	}

	const playable = toClientPlayableUrl(req.source);
	if (!/^https?:\/\//i.test(playable) && !/^raffi-media:/i.test(playable)) {
		throw new Error("This source cannot be clipped in-app yet");
	}

	const input = new Input({
		source: createRemoteUrlSource(playable, {
			parallelism: 2,
			maxCacheSize: 48 * 1024 * 1024,
		}),
		formats: ALL_FORMATS,
	});

	try {
		const target = new BufferTarget();
		const output = new Output({
			format: new Mp4OutputFormat({
				fastStart: "in-memory",
			}),
			target,
		});

		const conversion = await Conversion.init({
			input,
			output,
			tracks: "primary",
			showWarnings: false,
			trim: { start, end },
			video: async (track) => {
				const codec = await track.getCodec();
				if (codec === "avc" || codec === "hevc" || codec === "av1") {
					return { codec };
				}
				if (await track.canDecode()) {
					return { codec: "avc" as VideoCodec };
				}
				return { discard: true };
			},
			audio: async (track) => {
				const codec = await track.getCodec();
				if (codec === "aac" || codec === "mp3" || codec === "opus") {
					return { codec: "aac" as AudioCodec };
				}
				if (await track.canDecode()) {
					return {
						codec: "aac" as AudioCodec,
						numberOfChannels: Math.min(
							2,
							Math.max(1, await track.getNumberOfChannels()),
						),
						sampleRate: 48000,
						bitrate: 160e3,
					};
				}
				return { discard: true };
			},
		});

		if (!conversion.isValid) {
			const reason = conversion.discardedTracks
				.map((entry) => `${entry.track.type}:${entry.reason}`)
				.join(", ");
			throw new Error(
				reason ? `Unable to export clip (${reason})` : "Unable to export clip",
			);
		}

		if (req.onProgress) {
			conversion.onProgress = (progress) => {
				req.onProgress?.(progress);
			};
		}

		const abort = () => {
			void conversion.cancel().catch(() => {
				// ignore
			});
		};
		req.signal?.addEventListener("abort", abort, { once: true });

		try {
			await conversion.execute();
		} finally {
			req.signal?.removeEventListener("abort", abort);
		}

		if (req.signal?.aborted) {
			throw new DOMException("Aborted", "AbortError");
		}

		const buffer = target.buffer;
		if (!buffer || buffer.byteLength === 0) {
			throw new Error("Clip export produced an empty file");
		}

		return {
			bytes: new Uint8Array(buffer),
			mimeType: "video/mp4",
		};
	} finally {
		input.dispose();
	}
}
