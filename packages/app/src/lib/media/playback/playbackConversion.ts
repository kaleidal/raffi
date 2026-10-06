import {
	Conversion,
	type AudioCodec,
	type Input,
	type InputAudioTrack,
	type InputVideoTrack,
	type Output,
	type VideoCodec,
} from "mediabunny";
import { ensureAudioDecoderRegistered } from "../registerCoders";

const MSE_COPYABLE_AUDIO = new Set<AudioCodec | null>(["aac"]);

export type MseVideoOutput = {
	codec: VideoCodec;
	forceTranscode: boolean;
	mime: string;
};

export async function createPlaybackConversion(options: {
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
				? {
						codec: options.videoOutput.codec,
						forceTranscode: options.videoOutput.forceTranscode,
					}
				: { discard: true },
		audio: async (track) =>
			track.id === options.selectedInputAudioTrack?.id
				? audioConversionOptions(track)
				: { discard: true },
		trim: { start: options.startTimestamp },
		copy: { boundaryPolicy: "shrink" },
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
			`MediaBunny could not ${options.videoOutput.forceTranscode ? "transcode" : "remux"} ${codec} video on this platform${reason ? ` (${reason})` : ""}`,
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

async function audioConversionOptions(track: InputAudioTrack) {
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
