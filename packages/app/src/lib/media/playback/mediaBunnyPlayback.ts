import {
	AppendOnlyStreamTarget,
	type Conversion,
	Mp4OutputFormat,
	Output,
	type InputAudioTrack,
	type InputVideoTrack,
	type VideoCodec,
} from "mediabunny";
import { ensureAudioTracks, probeRemoteStream } from "../probe/probe";
import { MsePlayback } from "./msePlayback";
import { pickMseMimeType } from "./msePump";
import type { MseTimeline } from "./mseTimeline";
import { ensureMediaCodersRegistered } from "../registerCoders";
import {
	createPlaybackConversion,
	isBenignConversionError,
	type MseVideoOutput,
} from "./playbackConversion";
import type { PlaybackAttachOptions, PlaybackAttachResult } from "./playbackController";
import { acquireStreamInput } from "../probe/streamInput";

const MP4_COPYABLE_VIDEO = new Set<VideoCodec>(["avc", "hevc", "av1"]);
const AAC_CODEC_STRING = "mp4a.40.2";

async function resolveMseVideoOutput(
	track: InputVideoTrack,
	audioCodecString: string | null,
): Promise<MseVideoOutput> {
	const sourceCodec = await track.getCodec();
	const sourceCodecString = await track.getCodecParameterString();

	if (sourceCodec && MP4_COPYABLE_VIDEO.has(sourceCodec) && sourceCodecString) {
		const mime = pickMseMimeType(sourceCodecString, audioCodecString);
		if (mime) {
			return {
				codec: sourceCodec,
				forceTranscode: false,
				mime,
			};
		}
	}

	if (!(await track.canDecode())) {
		const codec = sourceCodec?.toUpperCase() || "This";
		throw new Error(
			`${codec} video is not supported by MediaSource and cannot be decoded for H.264 transcoding`,
		);
	}

	const mime = pickMseMimeType("avc1.4D401F", audioCodecString);
	if (!mime) {
		throw new Error("This browser cannot play H.264/AAC via MediaSource");
	}

	return {
		codec: "avc",
		forceTranscode: true,
		mime,
	};
}

/** Remuxes (or transcodes) a remote stream in the renderer with MediaBunny. */
export class MediaBunnyPlayback extends MsePlayback {
	private inputAudioTracks: InputAudioTrack[] = [];
	private videoOutput: MseVideoOutput | null = null;
	private conversion: Conversion | null = null;

	async attach(
		video: HTMLVideoElement,
		src: string,
		opts?: PlaybackAttachOptions,
	): Promise<PlaybackAttachResult> {
		await this.destroy();
		await ensureMediaCodersRegistered();

		this.video = video;
		const meta = ensureAudioTracks(opts?.meta ?? (await probeRemoteStream(src, opts?.signal)));
		this.meta = meta;
		this.stream = acquireStreamInput(src);
		const input = this.stream.input;

		const preferred = opts?.audioIndex ?? meta.preferredAudioIndex ?? 0;
		const preferredTrack = meta.audioTracks.find((track) => track.index === preferred);
		this.audioIndex =
			preferredTrack?.playable && preferredTrack.bunnyIndex != null
				? preferred
				: (meta.audioTracks.find((track) => track.playable && track.bunnyIndex != null)
						?.index ?? 0);

		const [videoTrack, inputAudioTracks] = await Promise.all([
			input.getPrimaryVideoTrack(),
			input.getAudioTracks(),
		]);
		if (!videoTrack) {
			throw new Error("This stream does not contain a playable video track");
		}
		this.videoTrack = videoTrack;
		this.inputAudioTracks = inputAudioTracks;

		await this.openTimeline(opts?.signal);
		await this.startWindow(Math.max(0, opts?.startTime ?? 0), true, opts?.signal);
		return { durationSeconds: meta.durationSeconds, meta };
	}

	async setAudioTrack(index: number, time: number): Promise<void> {
		const track = this.meta?.audioTracks.find((entry) => entry.index === index);
		if (!track) {
			throw new Error(`Audio track ${index} is not available`);
		}
		if (!track.playable || track.bunnyIndex == null) {
			throw new Error("This audio track uses a codec that cannot be remuxed in-app.");
		}
		this.audioIndex = index;
		await this.restartAt(time);
	}

	replaceMeta(meta: Parameters<MsePlayback["replaceMeta"]>[0]) {
		super.replaceMeta(ensureAudioTracks(meta));
	}

	async destroy() {
		await super.destroy();
		this.inputAudioTracks = [];
		this.videoOutput = null;
	}

	protected async mimeType() {
		if (!this.videoTrack) throw new Error("MediaBunny playback is not attached");
		this.videoOutput = await resolveMseVideoOutput(
			this.videoTrack,
			this.selectedAudioTrack() ? AAC_CODEC_STRING : null,
		);
		return this.videoOutput.mime;
	}

	protected async stopFeed() {
		const conversion = this.conversion;
		this.conversion = null;
		if (!conversion || conversion.state === "canceled" || conversion.state === "done") return;
		try {
			await conversion.cancel();
		} catch (error) {
			if (!isBenignConversionError(error)) {
				console.warn("MediaBunny conversion cancel failed", error);
			}
		}
	}

	protected async startFeed(timeline: MseTimeline, keyframe: number, signal: AbortSignal) {
		if (!this.stream || !this.videoTrack || !this.videoOutput) {
			throw new Error("MediaBunny playback is not attached");
		}
		const { writable, readable } = new TransformStream<Uint8Array, Uint8Array>();
		const conversion = await createPlaybackConversion({
			input: this.stream.input,
			output: new Output({
				format: new Mp4OutputFormat({
					fastStart: "fragmented",
					minimumFragmentDuration: 0.5,
				}),
				target: new AppendOnlyStreamTarget(writable),
			}),
			primaryVideoTrack: this.videoTrack,
			selectedInputAudioTrack: this.selectedAudioTrack(),
			videoOutput: this.videoOutput,
			startTimestamp: keyframe,
		});
		if (signal.aborted) {
			await conversion.cancel().catch(() => {});
			throw new DOMException("Aborted", "AbortError");
		}
		this.conversion = conversion;

		const done = Promise.all([
			timeline.pump(readable, signal, false),
			this.runWindowed(conversion, timeline, signal),
		]).then(
			() => {},
			(error) => {
				if (isBenignConversionError(error)) return;
				throw error;
			},
		);
		return { done };
	}

	private selectedAudioTrack(): InputAudioTrack | null {
		const selected = this.meta?.audioTracks.find((track) => track.index === this.audioIndex);
		const bunnyIndex =
			selected?.bunnyIndex ?? (selected?.playable === false ? -1 : this.audioIndex);
		return this.inputAudioTracks[bunnyIndex] ?? null;
	}

	/**
	 * Advances the conversion in windows so the buffer never runs far ahead of the
	 * playhead; cancelling and refilling instead would rebuild MSE from a keyframe.
	 */
	private async runWindowed(conversion: Conversion, timeline: MseTimeline, signal: AbortSignal) {
		const { aheadSeconds, resumeSeconds } = timeline.policy;
		let until = aheadSeconds;
		while (!signal.aborted) {
			await conversion.execute({ until });
			if (signal.aborted || conversion.state === "done") return;
			await timeline.waitForBufferBelow(resumeSeconds, signal);
			until += aheadSeconds - resumeSeconds;
		}
	}
}
