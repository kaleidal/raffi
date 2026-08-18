import type { AudioCodec } from "mediabunny";

let commonRegistration: Promise<void> | null = null;
let dtsRegistration: Promise<void> | null = null;

export function ensureMediaCodersRegistered() {
	commonRegistration ??= Promise.all([
		import("@mediabunny/ac3"),
		import("@mediabunny/aac-encoder"),
	])
		.then(([{ registerAc3Decoder }, { registerAacEncoder }]) => {
			registerAc3Decoder();
			registerAacEncoder();
		})
		.catch((error) => {
			commonRegistration = null;
			throw error;
		});
	return commonRegistration;
}

export function ensureAudioDecoderRegistered(codec: AudioCodec | null) {
	if (codec !== "dts") return Promise.resolve();
	dtsRegistration ??= import("@mediabunny/dts")
		.then(({ registerDtsDecoder }) => {
			registerDtsDecoder();
		})
		.catch((error) => {
			dtsRegistration = null;
			throw error;
		});
	return dtsRegistration;
}
