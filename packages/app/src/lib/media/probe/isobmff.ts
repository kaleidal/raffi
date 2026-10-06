import { readAscii } from "./ebml";

export type BoxInfo = {
	type: string;
	start: number;
	headerSize: number;
	contentStart: number;
	contentSize: number;
	end: number;
};

export function findBox(
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

export function readBox(data: Uint8Array, offset: number): BoxInfo | null {
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

export function readU32(data: Uint8Array, offset: number): number {
	return (
		((data[offset]! << 24) |
			(data[offset + 1]! << 16) |
			(data[offset + 2]! << 8) |
			data[offset + 3]!) >>>
		0
	);
}

export function readU64(data: Uint8Array, offset: number): bigint {
	const hi = BigInt(readU32(data, offset));
	const lo = BigInt(readU32(data, offset + 4));
	return (hi << 32n) | lo;
}
