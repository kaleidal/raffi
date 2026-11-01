import { requestNative } from "./bridge";

/** Asks Android for a voice prompt; resolves to what was said, or null when nothing was. */
export async function listenForSpeech() {
	const { text } = await requestNative<{ text: string | null }>({ type: "voice.listen" });
	return text?.trim() || null;
}
