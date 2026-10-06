import { findBox, readBox, readU32, readU64, type BoxInfo } from "../../probe/isobmff";
import { readAscii } from "../../probe/ebml";

const NON_SYNC_SAMPLE = 0x10000;
const BOX_HEADER_BYTES = 8;
const LARGE_BOX_HEADER_BYTES = 16;
const PARSED_BOXES = new Set(["moov", "moof"]);

const TFHD_BASE_DATA_OFFSET = 0x01;
const TFHD_SAMPLE_DESCRIPTION_INDEX = 0x02;
const TFHD_DEFAULT_DURATION = 0x08;
const TFHD_DEFAULT_SIZE = 0x10;
const TFHD_DEFAULT_FLAGS = 0x20;
const TRUN_DATA_OFFSET = 0x01;
const TRUN_FIRST_SAMPLE_FLAGS = 0x04;
const TRUN_SAMPLE_DURATION = 0x100;
const TRUN_SAMPLE_SIZE = 0x200;
const TRUN_SAMPLE_FLAGS = 0x400;

type VideoTrack = { id: number; timescale: number; defaultFlags: number };

const children = function* (data: Uint8Array, box: Pick<BoxInfo, "contentStart" | "end">) {
	let offset = box.contentStart;
	while (offset + BOX_HEADER_BYTES <= box.end) {
		const child = readBox(data, offset);
		if (!child || child.end > box.end) return;
		yield child;
		offset = child.end;
	}
};

const fullBoxFlags = (data: Uint8Array, box: BoxInfo) => readU32(data, box.contentStart) & 0xffffff;

function readVideoTrack(moov: Uint8Array): VideoTrack | null {
	const root = { contentStart: 0, end: moov.byteLength };
	const defaultFlags = new Map<number, number>();
	const mvex = findBox(moov, 0, moov.byteLength, "mvex");
	if (mvex) {
		for (const trex of children(moov, mvex)) {
			if (trex.type !== "trex") continue;
			defaultFlags.set(readU32(moov, trex.contentStart + 4), readU32(moov, trex.contentStart + 20));
		}
	}
	for (const trak of children(moov, root)) {
		if (trak.type !== "trak") continue;
		const tkhd = findBox(moov, trak.contentStart, trak.end, "tkhd");
		const mdia = findBox(moov, trak.contentStart, trak.end, "mdia");
		if (!tkhd || !mdia) continue;
		const hdlr = findBox(moov, mdia.contentStart, mdia.end, "hdlr");
		const mdhd = findBox(moov, mdia.contentStart, mdia.end, "mdhd");
		if (!hdlr || !mdhd || readAscii(moov.subarray(hdlr.contentStart + 8, hdlr.contentStart + 12)) !== "vide") {
			continue;
		}
		const tkhdVersion = moov[tkhd.contentStart]!;
		const id = readU32(moov, tkhd.contentStart + (tkhdVersion === 1 ? 20 : 12));
		const mdhdVersion = moov[mdhd.contentStart]!;
		const timescale = readU32(moov, mdhd.contentStart + (mdhdVersion === 1 ? 20 : 12));
		return { id, timescale, defaultFlags: defaultFlags.get(id) ?? 0 };
	}
	return null;
}

/** Decode time in seconds of the fragment's first video sample, when that sample is a keyframe. */
function fragmentKeyframe(moof: Uint8Array, track: VideoTrack): number | null {
	for (const traf of children(moof, { contentStart: 0, end: moof.byteLength })) {
		if (traf.type !== "traf") continue;
		const tfhd = findBox(moof, traf.contentStart, traf.end, "tfhd");
		const tfdt = findBox(moof, traf.contentStart, traf.end, "tfdt");
		const trun = findBox(moof, traf.contentStart, traf.end, "trun");
		if (!tfhd || !tfdt || !trun || readU32(moof, tfhd.contentStart + 4) !== track.id) continue;

		const tfhdFlags = fullBoxFlags(moof, tfhd);
		let tfhdOffset = tfhd.contentStart + 8;
		if (tfhdFlags & TFHD_BASE_DATA_OFFSET) tfhdOffset += 8;
		if (tfhdFlags & TFHD_SAMPLE_DESCRIPTION_INDEX) tfhdOffset += 4;
		if (tfhdFlags & TFHD_DEFAULT_DURATION) tfhdOffset += 4;
		if (tfhdFlags & TFHD_DEFAULT_SIZE) tfhdOffset += 4;
		let flags = tfhdFlags & TFHD_DEFAULT_FLAGS ? readU32(moof, tfhdOffset) : track.defaultFlags;

		const trunFlags = fullBoxFlags(moof, trun);
		let trunOffset = trun.contentStart + 8;
		if (trunFlags & TRUN_DATA_OFFSET) trunOffset += 4;
		if (trunFlags & TRUN_FIRST_SAMPLE_FLAGS) {
			flags = readU32(moof, trunOffset);
		} else if (trunFlags & TRUN_SAMPLE_FLAGS) {
			if (trunFlags & TRUN_SAMPLE_DURATION) trunOffset += 4;
			if (trunFlags & TRUN_SAMPLE_SIZE) trunOffset += 4;
			flags = readU32(moof, trunOffset);
		}
		if (flags & NON_SYNC_SAMPLE) return null;

		const decodeTime =
			moof[tfdt.contentStart] === 1
				? Number(readU64(moof, tfdt.contentStart + 4))
				: readU32(moof, tfdt.contentStart + 4);
		return decodeTime / track.timescale;
	}
	return null;
}

/**
 * Reads the init segment and fragment headers of one fragmented MP4 stream as it is
 * appended, reporting where keyframes land on the timeline. Media data is skipped.
 */
class FragmentScanner {
	private header = new Uint8Array(LARGE_BOX_HEADER_BYTES);
	private headerLength = 0;
	private box: Uint8Array | null = null;
	private boxType = "";
	private boxLength = 0;
	private skip = 0;
	private track: VideoTrack | null = null;

	constructor(
		private readonly offset: number,
		private readonly onKeyframe: (time: number) => void,
	) {}

	push(chunk: Uint8Array) {
		let position = 0;
		while (position < chunk.byteLength) {
			if (this.skip > 0) {
				const skipped = Math.min(this.skip, chunk.byteLength - position);
				this.skip -= skipped;
				position += skipped;
			} else if (this.box) {
				const copied = Math.min(this.box.byteLength - this.boxLength, chunk.byteLength - position);
				this.box.set(chunk.subarray(position, position + copied), this.boxLength);
				this.boxLength += copied;
				position += copied;
				if (this.boxLength === this.box.byteLength) this.finishBox(this.box);
			} else {
				position += this.readHeader(chunk, position);
			}
		}
	}

	private readHeader(chunk: Uint8Array, position: number) {
		const needed = (this.headerLength >= BOX_HEADER_BYTES && readU32(this.header, 0) === 1
			? LARGE_BOX_HEADER_BYTES
			: BOX_HEADER_BYTES) - this.headerLength;
		const copied = Math.min(needed, chunk.byteLength - position);
		this.header.set(chunk.subarray(position, position + copied), this.headerLength);
		this.headerLength += copied;
		if (this.headerLength < BOX_HEADER_BYTES) return copied;

		const size32 = readU32(this.header, 0);
		if (size32 === 1 && this.headerLength < LARGE_BOX_HEADER_BYTES) return copied;
		const headerSize = size32 === 1 ? LARGE_BOX_HEADER_BYTES : BOX_HEADER_BYTES;
		const size = size32 === 1 ? Number(readU64(this.header, 8)) : size32 === 0 ? Infinity : size32;
		const type = readAscii(this.header.subarray(4, 8));
		this.headerLength = 0;

		if (PARSED_BOXES.has(type) && Number.isFinite(size)) {
			this.box = new Uint8Array(size - headerSize);
			this.boxType = type;
			this.boxLength = 0;
			if (this.box.byteLength === 0) this.finishBox(this.box);
		} else {
			this.skip = size - headerSize;
		}
		return copied;
	}

	private finishBox(content: Uint8Array) {
		this.box = null;
		if (this.boxType === "moov") {
			this.track = readVideoTrack(content);
			return;
		}
		const time = this.track && fragmentKeyframe(content, this.track);
		if (time != null) this.onKeyframe(this.offset + time);
	}
}

/** Keyframe times of everything appended to a SourceBuffer, used to trim at safe points. */
export class FragmentKeyframes {
	private times: number[] = [];

	/** Starts reading one fragmented MP4 stream whose timestamps are shifted by `offset`. */
	scanner(offset: number) {
		return new FragmentScanner(offset, (time) => this.add(time));
	}

	/**
	 * Where media before `time` can be removed without breaking the frames after it: the
	 * latest keyframe at or before `time`, or `time` itself for streams with no readable
	 * fragment headers.
	 */
	cutPoint(time: number): number | null {
		if (this.times.length === 0) return time;
		const index = this.countBelow(time, true) - 1;
		return index < 0 ? null : this.times[index]!;
	}

	/** Forgets keyframes in [start, end) once that media is removed. */
	forget(start: number, end: number) {
		const from = this.countBelow(start, false);
		const to = this.countBelow(end, false);
		if (to > from) this.times.splice(from, to - from);
	}

	private add(time: number) {
		const index = this.countBelow(time, false);
		if (this.times[index] !== time) this.times.splice(index, 0, time);
	}

	/** How many keyframes lie before `time`, counting one at exactly `time` when `inclusive`. */
	private countBelow(time: number, inclusive: boolean) {
		let low = 0;
		let high = this.times.length;
		while (low < high) {
			const middle = (low + high) >> 1;
			const value = this.times[middle]!;
			if (value < time || (inclusive && value === time)) low = middle + 1;
			else high = middle;
		}
		return low;
	}
}
