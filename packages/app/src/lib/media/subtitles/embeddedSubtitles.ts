import { decodeText } from "../probe/ebml";
import {
	MatroskaSubtitleScanner,
	type MatroskaSubtitleBlock,
	type MatroskaSubtitleTrack,
	type SubtitleCompression,
} from "./matroskaSubtitleScanner";

export type EmbeddedSubtitleTrack = {
	number: number;
	language: string | null;
	name: string | null;
	isDefault: boolean;
	isForced: boolean;
};

export type EmbeddedCue = {
	start: number;
	end: number;
	text: string;
};

type CueListener = (cue: EmbeddedCue) => void;

const FALLBACK_CUE_SECONDS = 4;
const ZLIB = 0;
const HEADER_STRIPPING = 3;
const ASS_TEXT_FIELD = 8;

async function decompress(payload: Uint8Array, compression: SubtitleCompression | null) {
	if (!compression) return payload;
	if (compression.algorithm === HEADER_STRIPPING) {
		const header = compression.settings ?? new Uint8Array();
		const restored = new Uint8Array(header.byteLength + payload.byteLength);
		restored.set(header);
		restored.set(payload, header.byteLength);
		return restored;
	}
	if (compression.algorithm === ZLIB) {
		const stream = new Blob([payload as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate"));
		return new Uint8Array(await new Response(stream).arrayBuffer());
	}
	return null;
}

/** ASS events store "ReadOrder,Layer,Style,Name,MarginL,MarginR,MarginV,Effect,Text". */
function assText(line: string) {
	const fields = line.split(",");
	const text = fields.length > ASS_TEXT_FIELD ? fields.slice(ASS_TEXT_FIELD).join(",") : line;
	return text
		.replace(/\{[^}]*\}/g, "")
		.replace(/\\[Nn]/g, "\n")
		.replace(/\\h/g, " ");
}

function cueText(codecId: string, payload: Uint8Array) {
	const text = decodeText(payload);
	if (codecId === "S_TEXT/ASS" || codecId === "S_TEXT/SSA") return assText(text);
	return text;
}

/** Text subtitle tracks of one Matroska stream and the cues read so far. */
export class EmbeddedSubtitles {
	private trackInfo = new Map<number, MatroskaSubtitleTrack>();
	private cues = new Map<number, Map<string, EmbeddedCue>>();
	private listeners = new Map<number, Set<CueListener>>();
	private readonly scanner = new MatroskaSubtitleScanner({
		onTracks: (tracks) => {
			this.trackInfo = new Map(tracks.map((track) => [track.number, track]));
		},
		onBlock: (block) => void this.addBlock(block),
	});

	readonly observe = this.scanner.observe.bind(this.scanner);

	get tracks(): EmbeddedSubtitleTrack[] {
		return [...this.trackInfo.values()].map(({ number, language, name, isDefault, isForced }) => ({
			number,
			language,
			name,
			isDefault,
			isForced,
		}));
	}

	cuesFor(track: number): EmbeddedCue[] {
		return [...(this.cues.get(track)?.values() ?? [])].sort((a, b) => a.start - b.start);
	}

	subscribe(track: number, listener: CueListener) {
		let listeners = this.listeners.get(track);
		if (!listeners) {
			listeners = new Set();
			this.listeners.set(track, listeners);
		}
		listeners.add(listener);
		return () => listeners.delete(listener);
	}

	private async addBlock(block: MatroskaSubtitleBlock) {
		const track = this.trackInfo.get(block.track);
		if (!track) return;
		const payload = await decompress(block.payload, track.compression).catch(() => null);
		if (!payload) return;
		const text = cueText(track.codecId, payload).trim();
		if (!text) return;

		const cue = {
			start: block.start,
			end: block.start + (block.duration ?? FALLBACK_CUE_SECONDS),
			text,
		};
		let trackCues = this.cues.get(block.track);
		if (!trackCues) {
			trackCues = new Map();
			this.cues.set(block.track, trackCues);
		}
		const key = `${cue.start}\u0000${text}`;
		if (trackCues.has(key)) return;
		trackCues.set(key, cue);
		for (const listener of this.listeners.get(block.track) ?? []) listener(cue);
	}
}
