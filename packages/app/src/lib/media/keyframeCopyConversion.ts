import {
	Conversion,
	EncodedPacketSink,
	EncodedVideoPacketSource,
	type ConversionAudioOptions,
	type ConversionExecuteOptions,
	type EncodedPacket,
	type Input,
	type InputAudioTrack,
	type InputVideoTrack,
	type Output,
	type VideoCodec,
} from "mediabunny";

export type PlaybackConversion = {
	readonly state: "idle" | "executing" | "canceled" | "done";
	execute(options?: ConversionExecuteOptions): Promise<void>;
	cancel(): Promise<void>;
};

type KeyframeCopyConversionOptions = {
	input: Input;
	output: Output;
	videoTrack: InputVideoTrack;
	videoCodec: VideoCodec;
	audioTrack: InputAudioTrack | null;
	startTimestamp: number;
	audio: (track: InputAudioTrack) => Promise<ConversionAudioOptions>;
};

export class KeyframeCopyConversion implements PlaybackConversion {
	state: PlaybackConversion["state"] = "idle";

	private readonly videoSource: EncodedVideoPacketSource;
	private readonly videoPackets: AsyncGenerator<EncodedPacket, void>;
	private readonly decoderConfig: Awaited<
		ReturnType<InputVideoTrack["getDecoderConfig"]>
	>;
	private readonly audioConversion: Conversion | null;
	private pendingVideoPacket: EncodedPacket | null = null;
	private firstVideoPacket = true;
	private videoDone = false;
	private canceled = false;
	private outputStarted = false;
	private cancelPromise: Promise<void> | null = null;

	static async init(
		options: KeyframeCopyConversionOptions,
	): Promise<KeyframeCopyConversion> {
		const videoSource = new EncodedVideoPacketSource(options.videoCodec);
		options.output.addVideoTrack(videoSource, {
			languageCode: (await options.videoTrack.getLanguageCode()) ?? undefined,
			name: (await options.videoTrack.getName()) ?? undefined,
			disposition: await options.videoTrack.getDisposition(),
			rotation: await options.videoTrack.getRotation(),
		});

		let audioConversion: Conversion | null = null;
		if (options.audioTrack) {
			audioConversion = await Conversion.init({
				input: options.input,
				output: options.output,
				composable: true,
				tracks: "all",
				showWarnings: false,
				video: () => ({ discard: true }),
				audio: async (track) => {
					if (track.id !== options.audioTrack?.id) {
						return { discard: true };
					}
					return options.audio(track);
				},
				trim: { start: options.startTimestamp },
			});

			const retainedAudio = audioConversion.utilizedTracks.some(
				(track) =>
					track.isAudioTrack() && track.id === options.audioTrack?.id,
			);
			if (!retainedAudio) {
				const codec =
					(await options.audioTrack.getCodec()) ??
					(await options.audioTrack.getInternalCodecId()) ??
					"unknown";
				const reason = audioConversion.discardedTracks.find(
					(entry) =>
						entry.track.isAudioTrack() &&
						entry.track.id === options.audioTrack?.id,
				)?.reason;
				throw new Error(
					`MediaBunny could not decode ${codec} audio on this platform${reason ? ` (${reason})` : ""}`,
				);
			}
		}

		const packetSink = new EncodedPacketSink(options.videoTrack);
		const firstPacket = await packetSink.getKeyPacket(options.startTimestamp, {
			verifyKeyPackets: true,
		});
		if (!firstPacket) {
			throw new Error("No video keyframe was found for this playback position");
		}

		return new KeyframeCopyConversion(
			options.output,
			videoSource,
			packetSink.packets(firstPacket, undefined, {
				verifyKeyPackets: true,
			}),
			await options.videoTrack.getDecoderConfig(),
			audioConversion,
			options.startTimestamp,
		);
	}

	private constructor(
		private readonly output: Output,
		videoSource: EncodedVideoPacketSource,
		videoPackets: AsyncGenerator<EncodedPacket, void>,
		decoderConfig: Awaited<ReturnType<InputVideoTrack["getDecoderConfig"]>>,
		audioConversion: Conversion | null,
		private readonly startTimestamp: number,
	) {
		this.videoSource = videoSource;
		this.videoPackets = videoPackets;
		this.decoderConfig = decoderConfig;
		this.audioConversion = audioConversion;
	}

	async execute(options: ConversionExecuteOptions = {}): Promise<void> {
		if (this.state === "done") return;
		if (this.state === "canceled") {
			throw new DOMException("Aborted", "AbortError");
		}
		if (this.state === "executing") {
			throw new Error("Keyframe copy conversion is already executing");
		}

		this.state = "executing";
		const until = options.until ?? Infinity;

		try {
			if (!this.outputStarted) {
				await this.output.start();
				this.outputStarted = true;
			}
			await Promise.all([
				this.pumpVideo(until),
				this.audioConversion?.execute({ until }),
			]);

			if (this.canceled) return;

			const audioDone =
				!this.audioConversion || this.audioConversion.state === "done";
			if (this.videoDone && audioDone) {
				await this.output.finalize();
				this.state = "done";
			} else {
				this.state = "idle";
			}
		} catch (error) {
			if (!this.canceled) {
				this.state = "idle";
			}
			throw error;
		}
	}

	async cancel(): Promise<void> {
		if (this.state === "done" || this.state === "canceled") return;
		if (this.cancelPromise) return this.cancelPromise;

		this.canceled = true;
		this.state = "canceled";
		this.cancelPromise = (async () => {
			await this.videoPackets.return();
			if (
				this.audioConversion &&
				this.audioConversion.state !== "done" &&
				this.audioConversion.state !== "canceled"
			) {
				await this.audioConversion.cancel();
			}
			await this.output.cancel();
		})();
		return this.cancelPromise;
	}

	private async pumpVideo(until: number): Promise<void> {
		while (!this.videoDone && this.state !== "canceled") {
			const packet =
				this.pendingVideoPacket ?? (await this.videoPackets.next()).value;
			this.pendingVideoPacket = null;

			if (!packet) {
				this.videoDone = true;
				this.videoSource.close();
				return;
			}

			const timestamp = packet.timestamp - this.startTimestamp;
			if (timestamp >= until) {
				this.pendingVideoPacket = packet;
				return;
			}

			const adjustedPacket = packet.clone({
				timestamp: Math.max(0, timestamp),
			});
			await this.videoSource.add(
				adjustedPacket,
				this.firstVideoPacket
					? { decoderConfig: this.decoderConfig ?? undefined }
					: undefined,
			);
			this.firstVideoPacket = false;
		}
	}
}
