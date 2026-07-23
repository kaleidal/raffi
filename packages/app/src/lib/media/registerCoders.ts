import { registerAc3Decoder } from "@mediabunny/ac3";
import { registerAacEncoder } from "@mediabunny/aac-encoder";

let registered = false;

export function ensureMediaCodersRegistered() {
	if (registered) return;
	registerAc3Decoder();
	registerAacEncoder();
	registered = true;
}
