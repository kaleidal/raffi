import { FfmpegPlayback, canUseFfmpegPlayback, type ClientPlaybackController } from "./ffmpegPlayback";
import { MediaBunnyPlayback } from "./playback";
import { ensureAudioTracks, type ProbedStream } from "./probe";

type AttachOptions = Parameters<ClientPlaybackController["attach"]>[2];
type AttachResult = Awaited<ReturnType<ClientPlaybackController["attach"]>>;

export class AdaptivePlayback implements ClientPlaybackController {
	private controller: ClientPlaybackController | null = null;
	private video: HTMLVideoElement | null = null;
	private source = "";
	private ffmpegSource = "";
	private meta: ProbedStream | null = null;
	private audioIndex = 0;
	onWindowStartChange: ((globalStart: number) => void) | null = null;

	async attach(video: HTMLVideoElement, src: string, opts?: AttachOptions): Promise<AttachResult> {
		await this.destroy();
		if (!opts?.meta) throw new Error("Adaptive playback requires probed stream metadata");
		this.video = video;
		this.source = src;
		this.ffmpegSource = opts.ffmpegSource ?? src;
		this.meta = ensureAudioTracks(opts.meta);
		this.audioIndex = this.resolveAudioIndex(opts.audioIndex);
		return this.attachController(this.audioIndex, Math.max(0, opts.startTime ?? 0), opts.signal);
	}

	seek(globalTime: number) {
		if (!this.controller) throw new Error("Adaptive playback is not attached");
		return this.controller.seek(globalTime);
	}

	async setAudioTrack(index: number, globalTime: number) {
		if (!this.video || !this.meta) throw new Error("Adaptive playback is not attached");
		const track = this.meta.audioTracks.find((entry) => entry.index === index);
		if (!track) throw new Error(`Audio track ${index} is not available`);

		const needsFfmpeg = !track.playable;
		if (needsFfmpeg && !canUseFfmpegPlayback(this.meta, index)) {
			throw new Error("This audio track cannot be converted in-app");
		}
		const usingFfmpeg = this.controller instanceof FfmpegPlayback;
		if (this.controller && usingFfmpeg === needsFfmpeg) {
			this.audioIndex = index;
			return this.controller.setAudioTrack(index, globalTime);
		}

		const shouldResume = !this.video.paused;
		await this.controller?.destroy();
		this.controller = null;
		this.audioIndex = index;
		const attached = await this.attachController(index, globalTime);
		if (shouldResume) void this.video.play().catch(() => {});
		return attached.remuxOrigin;
	}

	getRemuxOrigin() {
		return this.controller?.getRemuxOrigin() ?? 0;
	}

	getAudioIndex() {
		return this.audioIndex;
	}

	getMeta() {
		return this.meta;
	}

	replaceMeta(meta: ProbedStream) {
		this.meta = ensureAudioTracks(meta);
		this.controller?.replaceMeta(this.meta);
	}

	async destroy() {
		const controller = this.controller;
		this.controller = null;
		await controller?.destroy();
		this.video = null;
		this.meta = null;
	}

	private resolveAudioIndex(requested?: number) {
		if (!this.meta) return 0;
		const index = requested ?? this.meta.preferredAudioIndex ?? 0;
		return this.meta.audioTracks.some((track) => track.index === index)
			? index
			: (this.meta.audioTracks[0]?.index ?? 0);
	}

	private async attachController(index: number, startTime: number, signal?: AbortSignal) {
		if (!this.video || !this.meta) throw new Error("Adaptive playback is not attached");
		const needsFfmpeg = canUseFfmpegPlayback(this.meta, index);
		const controller: ClientPlaybackController = needsFfmpeg
			? new FfmpegPlayback()
			: new MediaBunnyPlayback();
		controller.onWindowStartChange = (globalStart) => this.onWindowStartChange?.(globalStart);
		this.controller = controller;
		try {
			return await controller.attach(
				this.video,
				needsFfmpeg ? this.ffmpegSource : this.source,
				{ startTime, signal, meta: this.meta, audioIndex: index },
			);
		} catch (error) {
			if (this.controller === controller) this.controller = null;
			await controller.destroy();
			throw error;
		}
	}
}
