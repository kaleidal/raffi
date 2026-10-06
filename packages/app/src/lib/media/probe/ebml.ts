const TEXT_DECODER = new TextDecoder("utf-8", { fatal: false });

export const EBML = {
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
	Cues: 0x1c53bb6b,
	TimestampScale: 0x2ad7b1,
	Timestamp: 0xe7,
	SimpleBlock: 0xa3,
	BlockGroup: 0xa0,
	Block: 0xa1,
	BlockDuration: 0x9b,
	FlagDefault: 0x88,
	FlagForced: 0x55aa,
	DefaultDuration: 0x23e383,
	ContentEncodings: 0x6d80,
	ContentEncoding: 0x6240,
	ContentCompression: 0x5034,
	ContentCompAlgo: 0x4254,
	ContentCompSettings: 0x4255,
} as const;

export type ElementInfo = {
	id: number;
	size: number | null;
	headerSize: number;
	end: number;
	endAbsolute: (start: number) => number;
};

export function readElementAt(data: Uint8Array, offset: number): ElementInfo | null {
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

export function readVint(
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
		value = value * 256 + b;
		if (!isId && b !== 0xff) allOnes = false;
	}
	return { value, length, unknown: Boolean(allOnes && !isId) };
}

export function readElementIdBytes(bytes: Uint8Array): number {
	let value = 0;
	for (const b of bytes) value = (value << 8) | b;
	return value;
}

export function readUnsigned(bytes: Uint8Array): number {
	let value = 0;
	for (const b of bytes) value = value * 256 + b;
	return value;
}

export function readSigned16(data: Uint8Array, offset: number): number {
	const value = (data[offset]! << 8) | data[offset + 1]!;
	return value > 0x7fff ? value - 0x10000 : value;
}

export function decodeText(bytes: Uint8Array): string {
	return TEXT_DECODER.decode(bytes).replace(/\0+$/, "");
}

export function readAscii(bytes: Uint8Array): string {
	return TEXT_DECODER.decode(bytes).replace(/\0+$/, "").trim();
}

