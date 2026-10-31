import type { AudioCodec } from "mediabunny";

let commonRegistration: Promise<void> | null = null;

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

/** DTS and TrueHD decoders are large, so they only load for streams that need them. */
const extensionDecoders: Partial<Record<AudioCodec, () => Promise<void>>> = {
	dts: () => import("@mediabunny/dts").then(({ registerDtsDecoder }) => registerDtsDecoder()),
	truehd: () => import("@mediabunny/truehd").then(({ registerTrueHdDecoder }) => registerTrueHdDecoder()),
};

const extensionRegistrations = new Map<AudioCodec, Promise<void>>();

export function ensureAudioDecoderRegistered(codec: AudioCodec | null) {
	const load = codec ? extensionDecoders[codec] : undefined;
	if (!codec || !load) return Promise.resolve();
	let registration = extensionRegistrations.get(codec);
	if (!registration) {
		registration = load().catch((error) => {
			extensionRegistrations.delete(codec);
			throw error;
		});
		extensionRegistrations.set(codec, registration);
	}
	return registration;
}
