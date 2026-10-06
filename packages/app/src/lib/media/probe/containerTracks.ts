import { EBML, decodeText, readAscii, readElementAt, readSeekHead, readUnsigned } from "./ebml";
import { findBox, readBox, readU32, readU64 } from "./isobmff";
import { RangeReader } from "./rangeReader";

const ELEMENT_HEADER_BYTES = 12;
const BOX_HEADER_BYTES = 16;
const HEAD_WINDOW_BYTES = 64 * 1024;
const MATROSKA_HEADER_SCAN_BYTES = 4 * 1024 * 1024;
const BOX_TYPE = /^[a-z0-9 ]{4}$/i;

export type ContainerAudioTrack = {
	index: number;
	codecId: string | null;
	language: string | null;
	title: string | null;
	channels: number | null;
	enabled: boolean;
};

/** Parses the Tracks element of a Matroska/WebM file, keeping FlagEnabled=0 tracks. */
async function listMatroskaAudioTracks(reader: RangeReader): Promise<ContainerAudioTrack[]> {
	const first = readElementAt(await reader.read(0, ELEMENT_HEADER_BYTES), 0);
	if (!first) return [];

	let pos = first.end;
	let segmentDataStart = -1;
	let tracksOffset: number | null = null;
	const seekEntries: Array<{ id: number; position: number }> = [];

	while (pos < MATROSKA_HEADER_SCAN_BYTES) {
		const el = readElementAt(await reader.read(pos, pos + ELEMENT_HEADER_BYTES, HEAD_WINDOW_BYTES), 0);
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
		if (el.id === EBML.Tracks) {
			tracksOffset = pos;
			break;
		}
		if (el.id === EBML.Cluster || el.size == null) break;
		if (el.id === EBML.SeekHead) {
			const contentStart = pos + el.headerSize;
			seekEntries.push(...readSeekHead(await reader.read(contentStart, contentStart + el.size, HEAD_WINDOW_BYTES)));
		}
		pos = el.endAbsolute(pos);
	}

	if (tracksOffset == null && segmentDataStart >= 0) {
		const tracksSeek = seekEntries.find((entry) => entry.id === EBML.Tracks);
		if (tracksSeek) tracksOffset = segmentDataStart + tracksSeek.position;
	}
	if (tracksOffset == null) return [];

	const tracksEl = readElementAt(
		await reader.read(tracksOffset, tracksOffset + ELEMENT_HEADER_BYTES, HEAD_WINDOW_BYTES),
		0,
	);
	if (!tracksEl || tracksEl.id !== EBML.Tracks || tracksEl.size == null) return [];
	const contentStart = tracksOffset + tracksEl.headerSize;
	return parseTracksElement(await reader.read(contentStart, contentStart + tracksEl.size));
}

/** Audio tracks listed in the container headers of a remote Matroska or MP4 file. */
export async function listContainerAudioTracks(
	src: string,
	signal?: AbortSignal,
): Promise<ContainerAudioTrack[]> {
	if (!/^https?:\/\//i.test(src)) return [];
	const reader = new RangeReader(src, signal);
	const head = await reader.read(0, ELEMENT_HEADER_BYTES, HEAD_WINDOW_BYTES);
	return readElementAt(head, 0)?.id === EBML.EBML
		? listMatroskaAudioTracks(reader)
		: listIsobmffAudioTracks(reader);
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
				title = decodeText(content) || null;
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

/** Walks the top-level MP4 boxes to the moov box, wherever it sits in the file. */
async function listIsobmffAudioTracks(reader: RangeReader): Promise<ContainerAudioTrack[]> {
	let pos = 0;
	while (reader.size == null || pos + 8 <= reader.size) {
		const header = await reader.read(pos, pos + BOX_HEADER_BYTES, HEAD_WINDOW_BYTES);
		const size = readU32(header, 0);
		const type = readAscii(header.subarray(4, 8));
		if (!BOX_TYPE.test(type)) break;
		const headerSize = size === 1 ? 16 : 8;
		const total =
			size === 1 ? Number(readU64(header, 8)) : size === 0 ? (reader.size ?? pos) - pos : size;
		if (type === "moov") {
			return parseMoovAudioTracks(await reader.read(pos + headerSize, pos + total));
		}
		if (!Number.isFinite(total) || total <= 0) break;
		pos += total;
	}
	return [];
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
		const nameBox = findBox(
			trak,
			udta.contentStart,
			udta.contentStart + udta.contentSize,
			"\u00a9nam",
		);
		if (nameBox) {
			title =
				decodeText(trak.subarray(nameBox.contentStart, nameBox.contentStart + nameBox.contentSize)) ||
				null;
		}
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

function unpackMdhdLanguage(packed: number): string | null {
	if (packed === 0 || packed === 0x55c4) return null; // empty / 'und'
	const c1 = ((packed >> 10) & 31) + 0x60;
	const c2 = ((packed >> 5) & 31) + 0x60;
	const c3 = (packed & 31) + 0x60;
	const lang = String.fromCharCode(c1, c2, c3);
	return /^[a-z]{3}$/.test(lang) ? lang : null;
}
