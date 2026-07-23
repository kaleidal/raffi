export type ContainerAudioTrack = {
	index: number;
	codecId: string | null;
	language: string | null;
	title: string | null;
	channels: number | null;
	enabled: boolean;
};

const EBML = {
	EBML: 0x1a45dfa3,
	Segment: 0x18538067,
	SeekHead: 0x114d9b74,
	Seek: 0x4dbb,
	SeekID: 0x53ab,
	SeekPosition: 0x53ac,
	Info: 0x1549a966,
	Tracks: 0x1654ae6b,
	TrackEntry: 0xae,
	TrackNumber: 0xd7,
	TrackType: 0x83,
	FlagEnabled: 0xb9,
	Name: 0x536e,
	Language: 0x22b59c,
	LanguageBCP47: 0x22b59d,
	CodecID: 0x86,
	Audio: 0xe1,
	Channels: 0x9f,
	Cluster: 0x1f43b675,
} as const;

const TEXT_DECODER = new TextDecoder("utf-8", { fatal: false });

/**
 * Lists audio tracks from a remote Matroska/WebM file by parsing the Tracks
 * element over HTTP range requests. Does not drop FlagEnabled=0 tracks.
 */
export async function listMatroskaAudioTracks(
	src: string,
	signal?: AbortSignal,
): Promise<ContainerAudioTrack[]> {
	const reader = await RemoteBytes.open(src, signal);
	try {
		const header = await reader.read(0, 64);
		const first = readElementAt(header, 0);
		if (!first || first.id !== EBML.EBML) {
			return [];
		}

		let pos = first.end;
		const maxScan = Math.min(reader.size ?? 8 * 1024 * 1024, 12 * 1024 * 1024);
		let segmentDataStart = -1;
		let tracksOffset: number | null = null;
		const seekEntries: Array<{ id: number; position: number }> = [];

		while (pos < maxScan) {
			const chunk = await reader.read(pos, 64);
			const el = readElementAt(chunk, 0);
			if (!el) break;

			if (el.id === EBML.Segment) {
				segmentDataStart = pos + el.headerSize;
				pos = segmentDataStart;
				continue;
			}

			if (segmentDataStart < 0) {
				pos = el.endAbsolute(pos);
				continue;
			}

			const absoluteStart = pos;
			if (el.id === EBML.SeekHead) {
				const data = await reader.read(
					absoluteStart + el.headerSize,
					el.size ?? 0,
				);
				seekEntries.push(...parseSeekHead(data));
				pos = absoluteStart + el.headerSize + (el.size ?? 0);
				continue;
			}

			if (el.id === EBML.Tracks) {
				tracksOffset = absoluteStart;
				break;
			}

			if (el.id === EBML.Cluster) {
				break;
			}

			if (el.size == null) break;
			pos = absoluteStart + el.headerSize + el.size;
			if (pos - segmentDataStart > 4 * 1024 * 1024) break;
		}

		if (tracksOffset == null && segmentDataStart >= 0) {
			const tracksSeek = seekEntries.find((entry) => entry.id === EBML.Tracks);
			if (tracksSeek) {
				tracksOffset = segmentDataStart + tracksSeek.position;
			}
		}

		if (tracksOffset == null) return [];

		const tracksHeader = await reader.read(tracksOffset, 64);
		const tracksEl = readElementAt(tracksHeader, 0);
		if (!tracksEl || tracksEl.id !== EBML.Tracks || tracksEl.size == null) {
			return [];
		}

		const tracksData = await reader.read(
			tracksOffset + tracksEl.headerSize,
			tracksEl.size,
		);
		return parseTracksElement(tracksData);
	} finally {
		reader.close();
	}
}

export async function listContainerAudioTracks(
	src: string,
	signal?: AbortSignal,
): Promise<ContainerAudioTrack[]> {
	if (!/^https?:\/\//i.test(src)) return [];

	try {
		const mkv = await listMatroskaAudioTracks(src, signal);
		if (mkv.length > 0) return mkv;
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") throw error;
		console.warn("Matroska track listing failed", error);
	}

	try {
		return await listIsobmffAudioTracks(src, signal);
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") throw error;
		console.warn("ISOBMFF track listing failed", error);
		return [];
	}
}

function parseTracksElement(data: Uint8Array): ContainerAudioTrack[] {
	const audio: Array<Omit<ContainerAudioTrack, "index">> = [];
	let offset = 0;
	while (offset < data.byteLength) {
		const el = readElementAt(data, offset);
		if (!el || el.size == null) break;
		const contentStart = offset + el.headerSize;
		const contentEnd = contentStart + el.size;
		if (contentEnd > data.byteLength) break;

		if (el.id === EBML.TrackEntry) {
			const track = parseTrackEntry(data.subarray(contentStart, contentEnd));
			if (track) audio.push(track);
		}
		offset = contentEnd;
	}

	return audio.map((track, index) => ({ ...track, index }));
}

function parseTrackEntry(data: Uint8Array): Omit<ContainerAudioTrack, "index"> | null {
	let offset = 0;
	let trackType: number | null = null;
	let codecId: string | null = null;
	let language: string | null = null;
	let title: string | null = null;
	let channels: number | null = null;
	let enabled = true;

	while (offset < data.byteLength) {
		const el = readElementAt(data, offset);
		if (!el || el.size == null) break;
		const contentStart = offset + el.headerSize;
		const contentEnd = contentStart + el.size;
		if (contentEnd > data.byteLength) break;
		const content = data.subarray(contentStart, contentEnd);

		switch (el.id) {
			case EBML.TrackType:
				trackType = readUnsigned(content);
				break;
			case EBML.FlagEnabled:
				enabled = readUnsigned(content) !== 0;
				break;
			case EBML.CodecID:
				codecId = readAscii(content);
				break;
			case EBML.Name:
				title = TEXT_DECODER.decode(content).replace(/\0+$/, "") || null;
				break;
			case EBML.Language:
				if (!language) language = readAscii(content) || null;
				break;
			case EBML.LanguageBCP47: {
				const bcp = readAscii(content);
				language = bcp.split("-")[0] || language;
				break;
			}
			case EBML.Audio: {
				let aOff = 0;
				while (aOff < content.byteLength) {
					const aEl = readElementAt(content, aOff);
					if (!aEl || aEl.size == null) break;
					const aStart = aOff + aEl.headerSize;
					const aEnd = aStart + aEl.size;
					if (aEnd > content.byteLength) break;
					if (aEl.id === EBML.Channels) {
						channels = readUnsigned(content.subarray(aStart, aEnd));
					}
					aOff = aEnd;
				}
				break;
			}
			default:
				break;
		}
		offset = contentEnd;
	}

	// Matroska track type 2 = audio
	if (trackType !== 2) return null;

	return {
		codecId,
		language: language && language !== "und" ? language : null,
		title,
		channels,
		enabled,
	};
}

function parseSeekHead(data: Uint8Array): Array<{ id: number; position: number }> {
	const entries: Array<{ id: number; position: number }> = [];
	let offset = 0;
	while (offset < data.byteLength) {
		const el = readElementAt(data, offset);
		if (!el || el.size == null) break;
		const contentStart = offset + el.headerSize;
		const contentEnd = contentStart + el.size;
		if (contentEnd > data.byteLength) break;

		if (el.id === EBML.Seek) {
			let seekId: number | null = null;
			let seekPos: number | null = null;
			let inner = contentStart;
			while (inner < contentEnd) {
				const child = readElementAt(data, inner);
				if (!child || child.size == null) break;
				const cStart = inner + child.headerSize;
				const cEnd = cStart + child.size;
				if (cEnd > contentEnd) break;
				if (child.id === EBML.SeekID) {
					seekId = readElementIdBytes(data.subarray(cStart, cEnd));
				} else if (child.id === EBML.SeekPosition) {
					seekPos = readUnsigned(data.subarray(cStart, cEnd));
				}
				inner = cEnd;
			}
			if (seekId != null && seekPos != null) {
				entries.push({ id: seekId, position: seekPos });
			}
		}
		offset = contentEnd;
	}
	return entries;
}

async function listIsobmffAudioTracks(
	src: string,
	signal?: AbortSignal,
): Promise<ContainerAudioTrack[]> {
	const reader = await RemoteBytes.open(src, signal);
	try {
		const probe = await reader.read(0, Math.min(reader.size ?? 2 * 1024 * 1024, 2 * 1024 * 1024));
		if (probe.byteLength < 8) return [];

		const brand = readAscii(probe.subarray(4, 8));
		const looksMp4 =
			brand === "ftyp" || findBox(probe, 0, probe.byteLength, "moov") != null;
		if (!looksMp4) {
			return [];
		}

		let moov = findBox(probe, 0, probe.byteLength, "moov");
		if (!moov && reader.size != null) {
			// Scan top-level boxes for moov via ranges
			let pos = 0;
			while (pos + 8 < reader.size && pos < 64 * 1024 * 1024) {
				const header = await reader.read(pos, 16);
				const size = readU32(header, 0);
				const type = readAscii(header.subarray(4, 8));
				const headerSize = size === 1 ? 16 : 8;
				const total =
					size === 1
						? Number(readU64(header, 8))
						: size === 0
							? reader.size - pos
							: size;
				if (type === "moov") {
					const data = await reader.read(pos + headerSize, total - headerSize);
					return parseMoovAudioTracks(data);
				}
				if (!Number.isFinite(total) || total <= 0) break;
				pos += total;
			}
			return [];
		}

		if (!moov) return [];
		return parseMoovAudioTracks(
			probe.subarray(moov.contentStart, moov.contentStart + moov.contentSize),
		);
	} finally {
		reader.close();
	}
}

function parseMoovAudioTracks(moov: Uint8Array): ContainerAudioTrack[] {
	const audio: Array<Omit<ContainerAudioTrack, "index">> = [];
	let offset = 0;
	while (offset + 8 <= moov.byteLength) {
		const box = readBox(moov, offset);
		if (!box) break;
		if (box.type === "trak") {
			const track = parseTrakAudio(moov.subarray(box.contentStart, box.end));
			if (track) audio.push(track);
		}
		offset = box.end;
	}
	return audio.map((track, index) => ({ ...track, index }));
}

function parseTrakAudio(trak: Uint8Array): Omit<ContainerAudioTrack, "index"> | null {
	const mdia = findBox(trak, 0, trak.byteLength, "mdia");
	if (!mdia) return null;
	const mdiaData = trak.subarray(mdia.contentStart, mdia.contentStart + mdia.contentSize);

	const hdlr = findBox(mdiaData, 0, mdiaData.byteLength, "hdlr");
	if (!hdlr) return null;
	const handler = readAscii(
		mdiaData.subarray(hdlr.contentStart + 8, hdlr.contentStart + 12),
	);
	if (handler !== "soun") return null;

	let language: string | null = null;
	let title: string | null = null;
	let codecId: string | null = null;
	let channels: number | null = null;
	let enabled = true;

	const tkhd = findBox(trak, 0, trak.byteLength, "tkhd");
	if (tkhd && tkhd.contentSize >= 4) {
		const flags =
			(trak[tkhd.contentStart + 1]! << 16) |
			(trak[tkhd.contentStart + 2]! << 8) |
			trak[tkhd.contentStart + 3]!;
		enabled = (flags & 0x1) !== 0;
	}

	const mdhd = findBox(mdiaData, 0, mdiaData.byteLength, "mdhd");
	if (mdhd && mdhd.contentSize >= 20) {
		const version = mdiaData[mdhd.contentStart]!;
		const langOffset = mdhd.contentStart + (version === 1 ? 28 : 16);
		if (langOffset + 2 <= mdiaData.byteLength) {
			const packed = (mdiaData[langOffset]! << 8) | mdiaData[langOffset + 1]!;
			language = unpackMdhdLanguage(packed);
		}
	}

	const udta = findBox(trak, 0, trak.byteLength, "udta");
	if (udta) {
		const meta = findBox(
			trak,
			udta.contentStart,
			udta.contentStart + udta.contentSize,
			"meta",
		);
		// Common: ©nam in udta
		const nameBox = findBox(
			trak,
			udta.contentStart,
			udta.contentStart + udta.contentSize,
			"\u00a9nam",
		);
		if (nameBox) {
			title =
				TEXT_DECODER.decode(
					trak.subarray(nameBox.contentStart, nameBox.contentStart + nameBox.contentSize),
				).replace(/\0+$/, "") || null;
		}
		void meta;
	}

	const minf = findBox(mdiaData, 0, mdiaData.byteLength, "minf");
	if (minf) {
		const stbl = findBox(
			mdiaData,
			minf.contentStart,
			minf.contentStart + minf.contentSize,
			"stbl",
		);
		if (stbl) {
			const stsd = findBox(
				mdiaData,
				stbl.contentStart,
				stbl.contentStart + stbl.contentSize,
				"stsd",
			);
			if (stsd && stsd.contentSize > 16) {
				const sampleStart = stsd.contentStart + 8;
				codecId = readAscii(mdiaData.subarray(sampleStart + 4, sampleStart + 8));
				if (stsd.contentSize >= 28) {
					channels = (mdiaData[sampleStart + 16]! << 8) | mdiaData[sampleStart + 17]!;
				}
			}
		}
	}

	return {
		codecId,
		language,
		title,
		channels,
		enabled,
	};
}

type BoxInfo = {
	type: string;
	start: number;
	headerSize: number;
	contentStart: number;
	contentSize: number;
	end: number;
};

function findBox(
	data: Uint8Array,
	start: number,
	end: number,
	type: string,
): BoxInfo | null {
	let offset = start;
	while (offset + 8 <= end) {
		const box = readBox(data, offset);
		if (!box || box.end > end) break;
		if (box.type === type) return box;
		offset = box.end;
	}
	return null;
}

function readBox(data: Uint8Array, offset: number): BoxInfo | null {
	if (offset + 8 > data.byteLength) return null;
	let size = readU32(data, offset);
	const type = readAscii(data.subarray(offset + 4, offset + 8));
	let headerSize = 8;
	if (size === 1) {
		if (offset + 16 > data.byteLength) return null;
		size = Number(readU64(data, offset + 8));
		headerSize = 16;
	} else if (size === 0) {
		size = data.byteLength - offset;
	}
	if (!Number.isFinite(size) || size < headerSize) return null;
	return {
		type,
		start: offset,
		headerSize,
		contentStart: offset + headerSize,
		contentSize: size - headerSize,
		end: offset + size,
	};
}

function unpackMdhdLanguage(packed: number): string | null {
	if (packed === 0 || packed === 0x55c4) return null; // empty / 'und'
	const c1 = ((packed >> 10) & 31) + 0x60;
	const c2 = ((packed >> 5) & 31) + 0x60;
	const c3 = (packed & 31) + 0x60;
	const lang = String.fromCharCode(c1, c2, c3);
	return /^[a-z]{3}$/.test(lang) ? lang : null;
}

type ElementInfo = {
	id: number;
	size: number | null;
	headerSize: number;
	end: number;
	endAbsolute: (start: number) => number;
};

function readElementAt(data: Uint8Array, offset: number): ElementInfo | null {
	if (offset >= data.byteLength) return null;
	const idInfo = readVint(data, offset, true);
	if (!idInfo) return null;
	const sizeInfo = readVint(data, offset + idInfo.length, false);
	if (!sizeInfo) return null;
	const headerSize = idInfo.length + sizeInfo.length;
	const size = sizeInfo.unknown ? null : sizeInfo.value;
	return {
		id: idInfo.value,
		size,
		headerSize,
		end: offset + headerSize + (size ?? 0),
		endAbsolute: (start) => start + headerSize + (size ?? 0),
	};
}

function readVint(
	data: Uint8Array,
	offset: number,
	isId: boolean,
): { value: number; length: number; unknown: boolean } | null {
	if (offset >= data.byteLength) return null;
	const first = data[offset]!;
	let length = 1;
	let mask = 0x80;
	while (length <= 8 && (first & mask) === 0) {
		length++;
		mask >>= 1;
	}
	if (length > 8 || offset + length > data.byteLength) return null;

	let value = isId ? first : first & (mask - 1);
	let allOnes = !isId && value === mask - 1;
	for (let i = 1; i < length; i++) {
		const b = data[offset + i]!;
		value = (value << 8) | b;
		if (!isId && b !== 0xff) allOnes = false;
	}
	return { value, length, unknown: Boolean(allOnes && !isId) };
}

function readElementIdBytes(bytes: Uint8Array): number {
	let value = 0;
	for (const b of bytes) value = (value << 8) | b;
	return value;
}

function readUnsigned(bytes: Uint8Array): number {
	let value = 0;
	for (const b of bytes) value = (value << 8) | b;
	return value >>> 0;
}

function readAscii(bytes: Uint8Array): string {
	return TEXT_DECODER.decode(bytes).replace(/\0+$/, "").trim();
}

function readU32(data: Uint8Array, offset: number): number {
	return (
		((data[offset]! << 24) |
			(data[offset + 1]! << 16) |
			(data[offset + 2]! << 8) |
			data[offset + 3]!) >>>
		0
	);
}

function readU64(data: Uint8Array, offset: number): bigint {
	const hi = BigInt(readU32(data, offset));
	const lo = BigInt(readU32(data, offset + 4));
	return (hi << 32n) | lo;
}

class RemoteBytes {
	private cache = new Map<string, Uint8Array>();
	private constructor(
		readonly url: string,
		readonly size: number | null,
		private signal?: AbortSignal,
	) {}

	static async open(url: string, signal?: AbortSignal): Promise<RemoteBytes> {
		let size: number | null = null;
		try {
			const head = await fetch(url, {
				method: "HEAD",
				signal,
			});
			const len = head.headers.get("content-length");
			if (len && Number.isFinite(Number(len))) size = Number(len);
		} catch {
			// Some CDNs block HEAD; size stays unknown.
		}
		return new RemoteBytes(url, size, signal);
	}

	async read(start: number, length: number): Promise<Uint8Array> {
		if (length <= 0) return new Uint8Array();
		const end = start + length - 1;
		const key = `${start}:${end}`;
		const cached = this.cache.get(key);
		if (cached) return cached;

		const response = await fetch(this.url, {
			headers: { Range: `bytes=${start}-${end}` },
			signal: this.signal,
		});
		if (!(response.ok || response.status === 206)) {
			throw new Error(`Range request failed (${response.status})`);
		}
		const buffer = new Uint8Array(await response.arrayBuffer());
		this.cache.set(key, buffer);

		if (this.size == null) {
			const range = response.headers.get("content-range");
			const match = range?.match(/\/(\d+)\s*$/);
			if (match) {
				(this as { size: number | null }).size = Number(match[1]);
			}
		}
		return buffer;
	}

	close() {
		this.cache.clear();
	}
}
