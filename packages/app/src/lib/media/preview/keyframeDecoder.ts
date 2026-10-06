/**
 * Decodes standalone keyframes into small bitmaps. Every chunk is flushed on its own,
 * so the decoder never holds references between previews.
 */
export class KeyframeDecoder {
	private decoder: VideoDecoder | null = null;
	private output: VideoFrame | null = null;

	constructor(
		private readonly config: VideoDecoderConfig,
		private readonly width: number,
	) {}

	async decode(data: Uint8Array): Promise<ImageBitmap | null> {
		const decoder = this.configured();
		decoder.decode(new EncodedVideoChunk({ type: "key", timestamp: 0, data }));
		await decoder.flush();
		const frame = this.output;
		this.output = null;
		if (!frame) return null;
		try {
			return await createImageBitmap(frame, {
				resizeWidth: this.width,
				resizeHeight: Math.round((this.width * frame.displayHeight) / frame.displayWidth),
				resizeQuality: "medium",
			});
		} finally {
			frame.close();
		}
	}

	close() {
		if (this.decoder?.state !== "closed") this.decoder?.close();
		this.output?.close();
		this.output = null;
	}

	private configured() {
		if (this.decoder?.state === "configured") return this.decoder;
		this.decoder = new VideoDecoder({
			output: (frame) => {
				this.output?.close();
				this.output = frame;
			},
			error: () => {},
		});
		this.decoder.configure(this.config);
		return this.decoder;
	}
}
