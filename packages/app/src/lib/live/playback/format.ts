import { describeStatus, proxyUrl } from "../network/proxy";
import type { LiveChannel } from "../types";

export type StreamFormat = "hls" | "dash" | "mpegts" | "flv" | "file";

const EXTENSIONS: Array<[RegExp, StreamFormat]> = [
	[/\.m3u8?$/, "hls"],
	[/\.mpd$/, "dash"],
	[/\.(ts|mts|m2ts)$/, "mpegts"],
	[/\.flv$/, "flv"],
	[/\.(mp4|m4v|webm|mkv|mov)$/, "file"],
];

const CONTENT_TYPES: Array<[RegExp, StreamFormat]> = [
	[/mpegurl/i, "hls"],
	[/dash\+xml/i, "dash"],
	[/mp2t/i, "mpegts"],
	[/flv/i, "flv"],
];

const TS_PACKET = 188;
const SYNC_BYTE = 0x47;

function fromExtension(url: string) {
	const path = new URL(url).pathname.toLowerCase();
	return EXTENSIONS.find(([pattern]) => pattern.test(path))?.[1] ?? null;
}

function fromBytes(bytes: Uint8Array): StreamFormat {
	const head = new TextDecoder().decode(bytes.subarray(0, 512)).trimStart();
	if (head.startsWith("#EXTM3U")) return "hls";
	if (head.startsWith("<?xml") || head.startsWith("<MPD")) return "dash";
	if (head.startsWith("FLV")) return "flv";
	if (bytes[0] === SYNC_BYTE && (bytes.length <= TS_PACKET || bytes[TS_PACKET] === SYNC_BYTE)) return "mpegts";
	return "file";
}

/** Reads the start of a stream, for addresses that don't say what they serve, like `/user/pass/1234`. */
async function sniff(channel: LiveChannel): Promise<StreamFormat> {
	const response = await fetch(proxyUrl(channel.url, channel.headers));
	if (!response.ok || !response.body) {
		void response.body?.cancel();
		throw new Error(describeStatus(response.status, "the channel's server"));
	}
	const type = response.headers.get("content-type") ?? "";
	const known = CONTENT_TYPES.find(([pattern]) => pattern.test(type))?.[1];
	const reader = response.body.getReader();
	const { value } = known ? { value: undefined } : await reader.read();
	void reader.cancel();
	return known ?? (value ? fromBytes(value) : "file");
}

export const streamFormat = async (channel: LiveChannel) => fromExtension(channel.url) ?? sniff(channel);

export const MIME_TYPES: Record<StreamFormat, string | undefined> = {
	hls: "application/x-mpegURL",
	dash: "application/dash+xml",
	mpegts: "video/mp2t",
	flv: undefined,
	file: undefined,
};
