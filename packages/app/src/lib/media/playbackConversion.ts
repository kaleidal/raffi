import {
	Conversion,
	type AudioCodec,
	type Input,
	type InputAudioTrack,
	type InputVideoTrack,
	type Output,
	type VideoCodec,
} from "mediabunny";
import { ensureAudioDecoderRegistered } from "./registerCoders";

const MSE_COPYABLE_AUDIO = new Set<AudioCodec | null>(["aac"]);

export type MseVideoOutput = {
	codec: VideoCodec;
	forceTranscode: boolean;
	mime: string;
};

export async function createTranscodingConversion(options: {
	input: Input;
	output: Output;
	primaryVideoTrack: InputVideoTrack;
	selectedInputAudioTrack: InputAudioTrack | null;
	videoOutput: MseVideoOutput;
	startTimestamp: number;
}): Promise<Conversion> {
	const conversion = await Conversion.init({
		input: options.input,
		output: options.output,
		tracks: "all",
		showWarnings: false,
		video: (track) =>
			track.id === options.primaryVideoTrack.id
				? { codec: options.videoOutput.codec, forceTranscode: true }
				: { discard: true },
		audio: async (track) =>
			track.id === options.selectedInputAudioTrack?.id
				? audioConversionOptions(track)
				: { discard: true },
		trim: { start: options.startTimestamp },
	});

	const retainedVideo = conversion.utilizedTracks.some(
		(track) => track.isVideoTrack() && track.id === options.primaryVideoTrack.id,
	);
	if (!retainedVideo) {
		const codec =
			(await options.primaryVideoTrack.getCodec()) ??
			(await options.primaryVideoTrack.getInternalCodecId()) ??
			"unknown";
		const reason = conversion.discardedTracks.find(
			(entry) =>
				entry.track.isVideoTrack() &&
				entry.track.id === options.primaryVideoTrack.id,
		)?.reason;
		throw new Error(
			`MediaBunny could not transcode ${codec} video on this platform${reason ? ` (${reason})` : ""}`,
		);
	}

	if (options.selectedInputAudioTrack) {
		const retainedAudio = conversion.utilizedTracks.some(
			(track) =>
				track.isAudioTrack() && track.id === options.selectedInputAudioTrack?.id,
		);
		if (!retainedAudio) {
			const codec =
				(await options.selectedInputAudioTrack.getCodec()) ??
				(await options.selectedInputAudioTrack.getInternalCodecId()) ??
				"unknown";
			const reason = conversion.discardedTracks.find(
				(entry) =>
					entry.track.isAudioTrack() &&
					entry.track.id === options.selectedInputAudioTrack?.id,
			)?.reason;
			throw new Error(
				`MediaBunny could not decode ${codec} audio on this platform${reason ? ` (${reason})` : ""}`,
			);
		}
	}

	return conversion;
}

export function isBenignConversionError(error: unknown): boolean {
	if (error instanceof DOMException && error.name === "AbortError") return true;
	const name = error instanceof Error ? error.name : "";
	const message = error instanceof Error ? error.message : String(error);
	return (
		name === "ConversionCanceledError" ||
		/cancel|abort|ERRORED writable|reclaimed due to inactivity/i.test(
			`${name} ${message}`,
		)
	);
}

export async function audioConversionOptions(track: InputAudioTrack) {
	const codec = await track.getCodec();
	if (MSE_COPYABLE_AUDIO.has(codec)) return { codec: "aac" as AudioCodec };
	await ensureAudioDecoderRegistered(codec);

	const channels = await track.getNumberOfChannels();
	return {
		codec: "aac" as AudioCodec,
		numberOfChannels: Math.min(2, Math.max(1, channels || 2)),
		sampleRate: 48000,
		bitrate: 160e3,
	};
}

export function waitForFirstBuffer(
	sourceBuffer: SourceBuffer,
	signal: AbortSignal,
): Promise<void> {
	if (sourceBuffer.buffered.length > 0) return Promise.resolve();

	return new Promise((resolve, reject) => {
		let timeout = 0;
		const armTimeout = () => {
			window.clearTimeout(timeout);
			timeout = window.setTimeout(() => {
				cleanup();
				reject(new Error("Timed out waiting for playable remux output"));
			}, 20_000);
		};
		const onUpdate = () => {
			if (sourceBuffer.buffered.length > 0) {
				cleanup();
				resolve();
				return;
			}
			armTimeout();
		};
		const onAbort = () => {
			cleanup();
			reject(new DOMException("Aborted", "AbortError"));
		};
		const cleanup = () => {
			window.clearTimeout(timeout);
			sourceBuffer.removeEventListener("updateend", onUpdate);
			signal.removeEventListener("abort", onAbort);
		};
		sourceBuffer.addEventListener("updateend", onUpdate);
		signal.addEventListener("abort", onAbort, { once: true });
		armTimeout();
	});
}

function bufferedEndAtOrAfter(
	sourceBuffer: SourceBuffer,
	video: HTMLVideoElement | null,
	time: number,
): boolean {
	try {
		const buffered =
			video && video.buffered.length > 0 ? video.buffered : sourceBuffer.buffered;
		if (buffered.length === 0) return time <= 0;
		for (let i = 0; i < buffered.length; i++) {
			const start = buffered.start(i);
			const end = buffered.end(i);
			if (time <= 0 && end > start) return true;
			if (time >= start - 0.05 && end >= time) return true;
		}
		return false;
	} catch {
		return false;
	}
}

export function waitForBufferedThrough(
	sourceBuffer: SourceBuffer,
	video: HTMLVideoElement | null,
	time: number,
	signal?: AbortSignal,
): Promise<void> {
	if (bufferedEndAtOrAfter(sourceBuffer, video, time)) return Promise.resolve();

	return new Promise((resolve, reject) => {
		const onUpdate = () => {
			if (bufferedEndAtOrAfter(sourceBuffer, video, time)) {
				cleanup();
				resolve();
			}
		};
		const onAbort = () => {
			cleanup();
			reject(new DOMException("Aborted", "AbortError"));
		};
		const timeout = window.setTimeout(() => {
			cleanup();
			resolve();
		}, 8_000);
		const cleanup = () => {
			window.clearTimeout(timeout);
			sourceBuffer.removeEventListener("updateend", onUpdate);
			signal?.removeEventListener("abort", onAbort);
		};
		sourceBuffer.addEventListener("updateend", onUpdate);
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}
