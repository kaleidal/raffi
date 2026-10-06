import {
	EBML,
	decodeText,
	readAscii,
	readSigned16,
	readUnsigned,
	readVint,
} from "../probe/ebml";

export type SubtitleCompression = { algorithm: number; settings: Uint8Array | null };

export type MatroskaSubtitleTrack = {
	number: number;
	codecId: string;
	language: string | null;
	name: string | null;
	isDefault: boolean;
	isForced: boolean;
	compression: SubtitleCompression | null;
};

export type MatroskaSubtitleBlock = {
	track: number;
	start: number;
	duration: number | null;
	payload: Uint8Array;
};

export type ScannerEvents = {
	onTracks: (tracks: MatroskaSubtitleTrack[]) => void;
	onBlock: (block: MatroskaSubtitleBlock) => void;
};

const TEXT_SUBTITLE_CODECS = new Set(["S_TEXT/UTF8", "S_TEXT/ASS", "S_TEXT/SSA", "S_TEXT/WEBVTT"]);
const MATROSKA_SUBTITLE_TRACK_TYPE = 0x11;
const CRC32 = 0xbf;
const MAX_COLLECTED_BYTES = 8 * 1024 * 1024;
const MAX_SUBTITLE_BLOCK_BYTES = 256 * 1024;
const BLOCK_HEAD_BYTES = 12;
const MAX_PARKED_CURSORS = 8;
const MAX_HEADER_BYTES = 16;
const CLUSTER_MAGIC = [0x1f, 0x43, 0xb6, 0x75];

type Context = { id: number; end: number | null };

type PendingBlock = { track: number; relative: number; payload: Uint8Array };

function* children(data: Uint8Array) {
	let offset = 0;
	while (offset < data.byteLength) {
		const id = readVint(data, offset, true);
		const size = id && readVint(data, offset + id.length, false);
		if (!id || !size || size.unknown) return;
		const start = offset + id.length + size.length;
		const end = start + size.value;
		if (end > data.byteLength) return;
		yield { id: id.value, content: data.subarray(start, end) };
		offset = end;
	}
}

function parseCompression(encodings: Uint8Array): SubtitleCompression | null {
	for (const encoding of children(encodings)) {
		if (encoding.id !== EBML.ContentEncoding) continue;
		for (const child of children(encoding.content)) {
			if (child.id !== EBML.ContentCompression) continue;
			let algorithm = 0;
			let settings: Uint8Array | null = null;
			for (const field of children(child.content)) {
				if (field.id === EBML.ContentCompAlgo) algorithm = readUnsigned(field.content);
				if (field.id === EBML.ContentCompSettings) settings = field.content.slice();
			}
			return { algorithm, settings };
		}
	}
	return null;
}

function parseSubtitleTracks(tracks: Uint8Array): MatroskaSubtitleTrack[] {
	const result: MatroskaSubtitleTrack[] = [];
	for (const entry of children(tracks)) {
		if (entry.id !== EBML.TrackEntry) continue;
		let number = 0;
		let type = 0;
		let codecId = "";
		let language: string | null = null;
		let name: string | null = null;
		let isDefault = true;
		let isForced = false;
		let compression: SubtitleCompression | null = null;
		for (const field of children(entry.content)) {
			switch (field.id) {
				case EBML.TrackNumber: number = readUnsigned(field.content); break;
				case EBML.TrackType: type = readUnsigned(field.content); break;
				case EBML.CodecID: codecId = readAscii(field.content); break;
				case EBML.Name: name = decodeText(field.content) || null; break;
				case EBML.Language: language ??= readAscii(field.content) || null; break;
				case EBML.LanguageBCP47: language = readAscii(field.content).split("-")[0] || language; break;
				case EBML.FlagDefault: isDefault = readUnsigned(field.content) !== 0; break;
				case EBML.FlagForced: isForced = readUnsigned(field.content) !== 0; break;
				case EBML.ContentEncodings: compression = parseCompression(field.content); break;
			}
		}
		if (type === MATROSKA_SUBTITLE_TRACK_TYPE && TEXT_SUBTITLE_CODECS.has(codecId)) {
			result.push({
				number,
				codecId,
				language: language && language !== "und" ? language : null,
				name,
				isDefault,
				isForced,
				compression,
			});
		}
	}
	return result;
}

function findClusterMagic(data: Uint8Array): number {
	for (let i = 0; i + 3 < data.byteLength; i++) {
		if (
			data[i] === CLUSTER_MAGIC[0] &&
			data[i + 1] === CLUSTER_MAGIC[1] &&
			data[i + 2] === CLUSTER_MAGIC[2] &&
			data[i + 3] === CLUSTER_MAGIC[3]
		) {
			return i;
		}
	}
	return -1;
}

const concat = (a: Uint8Array, b: Uint8Array) => {
	if (a.byteLength === 0) return b;
	const out = new Uint8Array(a.byteLength + b.byteLength);
	out.set(a);
	out.set(b, a.byteLength);
	return out;
};

/** Parses one contiguous run of file bytes, possibly continued by a later response. */
class ScanCursor {
	private buffer: Uint8Array = new Uint8Array();
	private skip = 0;
	private stack: Context[] = [];
	private clusterTimestamp: number | null = null;
	private group: { block: PendingBlock | null; duration: number | null } | null = null;
	private failed = false;

	constructor(
		private readonly scanner: MatroskaSubtitleScanner,
		private position: number,
		private synced: boolean,
	) {}

	/** File offset just past the last byte received. */
	get end() {
		return this.position + this.buffer.byteLength;
	}

	push(chunk: Uint8Array) {
		if (this.failed) return;
		try {
			this.consume(chunk);
		} catch (error) {
			this.failed = true;
			console.warn("Embedded subtitle parsing stopped", error);
		}
	}

	private consume(chunk: Uint8Array) {
		if (this.skip > 0) {
			const skipped = Math.min(this.skip, chunk.byteLength);
			this.skip -= skipped;
			this.position += skipped;
			chunk = chunk.subarray(skipped);
			if (chunk.byteLength === 0) return;
		}
		this.buffer = concat(this.buffer, chunk);
		while (this.step()) {
			// keep parsing while whole elements are available
		}
	}

	private drop(count: number) {
		const available = Math.min(count, this.buffer.byteLength);
		this.buffer = this.buffer.subarray(available);
		this.position += available;
		this.skip += count - available;
	}

	private closeFinishedContexts() {
		while (this.stack.length > 0) {
			const top = this.stack[this.stack.length - 1]!;
			if (top.end == null || this.position < top.end) return;
			this.stack.pop();
			if (top.id === EBML.BlockGroup) this.finishGroup();
			if (top.id === EBML.Cluster) this.clusterTimestamp = null;
		}
	}

	private resync(): boolean {
		const index = findClusterMagic(this.buffer);
		if (index < 0) {
			this.drop(Math.max(0, this.buffer.byteLength - 3));
			return false;
		}
		this.drop(index);
		const id = readVint(this.buffer, 0, true);
		const size = id && readVint(this.buffer, id.length, false);
		if (!id || !size) return false;
		const headerSize = id.length + size.length;
		const firstChild = readVint(this.buffer, headerSize, true);
		if (!firstChild) return false;
		if (firstChild.value !== EBML.Timestamp && firstChild.value !== CRC32) {
			this.drop(1);
			return true;
		}
		this.stack = [{ id: EBML.Segment, end: null }];
		this.synced = true;
		return true;
	}

	/** Handles one element or header; returns false when it needs more bytes. */
	private step(): boolean {
		if (this.skip > 0) return false;
		this.closeFinishedContexts();
		if (!this.synced) return this.resync();

		const id = readVint(this.buffer, 0, true);
		const size = id && readVint(this.buffer, id.length, false);
		if (!id || !size) {
			if (this.buffer.byteLength < MAX_HEADER_BYTES) return false;
			return this.loseSync();
		}
		if (this.position === 0 && id.value !== EBML.EBML) {
			this.scanner.setTracks([]);
			this.failed = true;
			return false;
		}
		const headerSize = id.length + size.length;
		const contentSize = size.unknown ? null : size.value;
		const start = this.position;
		const parent = this.stack[this.stack.length - 1]?.id ?? null;
		const contentEnd = contentSize == null ? null : start + headerSize + contentSize;

		if (parent === EBML.Cluster && contentSize == null) return this.loseSync();
		if (
			parent === EBML.Cluster &&
			this.stack[this.stack.length - 1]!.end == null &&
			(id.value === EBML.Cluster || id.value === EBML.Cues)
		) {
			this.stack.pop();
			this.clusterTimestamp = null;
			return true;
		}

		switch (id.value) {
			case EBML.Segment:
			case EBML.Cluster:
			case EBML.BlockGroup:
				this.stack.push({ id: id.value, end: contentEnd });
				if (id.value === EBML.BlockGroup) this.group = { block: null, duration: null };
				this.drop(headerSize);
				return true;
			case EBML.Info:
			case EBML.Tracks:
			case EBML.Timestamp:
			case EBML.BlockDuration:
				return this.collect(headerSize, contentSize, (content) => this.handleSmall(id.value, content));
			case EBML.SimpleBlock:
			case EBML.Block:
				return this.handleBlock(id.value, headerSize, contentSize);
			default:
				if (contentSize == null) return this.loseSync();
				this.drop(headerSize + contentSize);
				return true;
		}
	}

	/** Treats the bytes ahead as unknown and searches for the next cluster. */
	private loseSync() {
		this.synced = false;
		this.stack = [];
		this.clusterTimestamp = null;
		this.group = null;
		return true;
	}

	private collect(
		headerSize: number,
		contentSize: number | null,
		handle: (content: Uint8Array) => void,
	): boolean {
		if (contentSize == null) return this.loseSync();
		if (contentSize > MAX_COLLECTED_BYTES) {
			this.drop(headerSize + contentSize);
			return true;
		}
		if (this.buffer.byteLength < headerSize + contentSize) return false;
		handle(this.buffer.slice(headerSize, headerSize + contentSize));
		this.drop(headerSize + contentSize);
		return true;
	}

	private handleSmall(id: number, content: Uint8Array) {
		switch (id) {
			case EBML.Info:
				for (const field of children(content)) {
					if (field.id === EBML.TimestampScale) this.scanner.setTimestampScale(readUnsigned(field.content));
				}
				break;
			case EBML.Tracks:
				this.scanner.setTracks(parseSubtitleTracks(content));
				break;
			case EBML.Timestamp:
				this.clusterTimestamp = readUnsigned(content);
				break;
			case EBML.BlockDuration:
				if (this.group) this.group.duration = readUnsigned(content);
				break;
		}
	}

	private handleBlock(id: number, headerSize: number, contentSize: number | null): boolean {
		if (contentSize == null) return this.loseSync();
		if (!this.scanner.hasSubtitleTracks()) {
			this.drop(headerSize + contentSize);
			return true;
		}
		const headBytes = Math.min(contentSize, BLOCK_HEAD_BYTES);
		if (this.buffer.byteLength < headerSize + headBytes) return false;
		const track = readVint(this.buffer, headerSize, false);
		if (!track || !this.scanner.isSubtitleTrack(track.value) || contentSize > MAX_SUBTITLE_BLOCK_BYTES) {
			this.drop(headerSize + contentSize);
			return true;
		}
		return this.collect(headerSize, contentSize, (content) => {
			const block: PendingBlock = {
				track: track.value,
				relative: readSigned16(content, track.length),
				payload: content.slice(track.length + 3),
			};
			if (id === EBML.Block && this.group) this.group.block = block;
			else this.emit(block, null);
		});
	}

	private finishGroup() {
		if (this.group?.block) this.emit(this.group.block, this.group.duration);
		this.group = null;
	}

	private emit(block: PendingBlock, duration: number | null) {
		if (this.clusterTimestamp == null) return;
		const scale = this.scanner.timestampScale / 1e9;
		this.scanner.events.onBlock({
			track: block.track,
			start: (this.clusterTimestamp + block.relative) * scale,
			duration: duration == null ? null : duration * scale,
			payload: block.payload,
		});
	}
}

/**
 * Extracts text subtitle blocks from Matroska bytes as they are downloaded for playback,
 * without requesting anything extra. Responses that start mid-file resync on the next
 * cluster; a response that continues where an earlier one stopped resumes its state.
 */
export class MatroskaSubtitleScanner {
	timestampScale = 1_000_000;
	private subtitleTracks = new Set<number>();
	private tracksKnown = false;
	private parked = new Map<number, ScanCursor>();

	constructor(readonly events: ScannerEvents) {}

	setTimestampScale(scale: number) {
		if (scale > 0) this.timestampScale = scale;
	}

	setTracks(tracks: MatroskaSubtitleTrack[]) {
		this.tracksKnown = true;
		this.subtitleTracks = new Set(tracks.map((track) => track.number));
		this.events.onTracks(tracks);
	}

	hasSubtitleTracks() {
		return this.subtitleTracks.size > 0;
	}

	isSubtitleTrack(number: number) {
		return this.subtitleTracks.has(number);
	}

	/** Passes `body` through unchanged while scanning it; `start` is its file offset. */
	observe(start: number, body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
		if (this.tracksKnown && !this.hasSubtitleTracks()) return body;
		const cursor = this.parked.get(start) ?? new ScanCursor(this, start, start === 0);
		this.parked.delete(start);
		const reader = body.getReader();
		const park = () => {
			this.parked.set(cursor.end, cursor);
			while (this.parked.size > MAX_PARKED_CURSORS) {
				this.parked.delete(this.parked.keys().next().value!);
			}
		};
		return new ReadableStream<Uint8Array>({
			async pull(controller) {
				try {
					const { done, value } = await reader.read();
					if (done) {
						park();
						controller.close();
						return;
					}
					controller.enqueue(value);
					cursor.push(value);
				} catch (error) {
					park();
					controller.error(error);
				}
			},
			cancel(reason) {
				park();
				return reader.cancel(reason);
			},
		});
	}
}
