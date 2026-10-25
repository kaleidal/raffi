import type { AudioCodec, VideoCodec } from "mediabunny";

export const NATIVE_AUDIO = new Set<AudioCodec | null>(["aac", "mp3", "opus", "flac", "vorbis"]);

export function normalizeCodecId(value: string | AudioCodec | null | undefined): string {
	return (value || "").toString().trim().toLowerCase().replace(/^a_/, "");
}

export function codecsCompatible(a: string, b: string): boolean {
	if (!a || !b) return false;
	if (a === b || a.includes(b) || b.includes(a)) return true;
	const aliases = [
		["eac3", "ec-3"], ["ac3", "ac-3"], ["aac", "mp4a"],
		["mp3", "mpeg/l3"], ["opus"], ["flac"],
	];
	return aliases.some((group) => group.some((item) => a.includes(item)) && group.some((item) => b.includes(item)));
}

export function mapContainerCodec(codecId: string | null): AudioCodec | null {
	if (!codecId) return null;
	const id = codecId.toUpperCase();
	if (id.startsWith("A_AAC") || id === "MP4A") return "aac";
	if (id.includes("MPEG/L3") || id === "MP3") return "mp3";
	if (id.includes("OPUS")) return "opus";
	if (id.includes("VORBIS")) return "vorbis";
	if (id.includes("FLAC")) return "flac";
	if (id === "A_AC3" || id === "AC-3") return "ac3";
	if (id === "A_EAC3" || id === "EC-3") return "eac3";
	if (id.startsWith("A_DTS") || id === "DTS") return "dts";
	return null;
}

export function isNativeFriendlyAudio(codec: AudioCodec | null, supportsEac3: boolean): boolean {
	return NATIVE_AUDIO.has(codec) || Boolean(supportsEac3 && (codec === "eac3" || codec === "ac3"));
}

export function isMseFriendlyVideo(codec: VideoCodec | null): boolean {
	return codec === "avc" || codec === "hevc" || codec === "av1" || codec === "vp9" || codec === "vp8";
}
