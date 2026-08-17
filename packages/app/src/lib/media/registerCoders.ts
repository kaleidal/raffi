import { registerAc3Decoder } from "@mediabunny/ac3";
import { registerAacEncoder } from "@mediabunny/aac-encoder";
import type { AudioCodec } from "mediabunny";

let registered = false;
let dtsRegistration: Promise<void> | null = null;

export function ensureMediaCodersRegistered() {
	if (registered) return;
	registerAc3Decoder();
	registerAacEncoder();
	registered = true;
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
