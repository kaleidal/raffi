import {
	EBML,
	childElements,
	readElementAt,
	readSeekHead,
	readUnsignedChild,
	readVint,
} from "../probe/ebml";
import type { RangeReader } from "../probe/rangeReader";

const HEAD_BYTES = 64 * 1024;
const ELEMENT_HEADER_BYTES = 12;
const MIN_READ_AHEAD = 128 * 1024;
const READ_AHEAD_MARGIN = 1.25;
const DEFAULT_TIMESTAMP_SCALE = 1_000_000;
const NANOSECONDS_PER_SECOND = 1e9;
const SIMPLE_BLOCK_KEYFRAME = 0x80;
const BLOCK_LACING = 0x06;

type CuePoint = {
	time: number;
	cluster: number;
	relative: number | null;
};

export type PreviewKeyframe = {
	timestamp: number;
	read: () => Promise<Uint8Array | null>;
};

async function readElement(reader: RangeReader, position: number, id: number) {
	const header = readElementAt(await reader.read(position, position + ELEMENT_HEADER_BYTES), 0);
	if (header?.id !== id || header.size == null) return null;
	return reader.read(position + header.headerSize, header.end + position);
}

function parseCues(cues: Uint8Array, track: number, segmentStart: number, timestampScale: number) {
	const points: CuePoint[] = [];
	for (const point of childElements(cues)) {
		if (point.id !== EBML.CuePoint) continue;
		let time: number | null = null;
		for (const child of childElements(cues, point.start, point.end)) {
			if (child.id === EBML.CueTime) {
				time = (readUnsignedChild(cues, child) * timestampScale) / NANOSECONDS_PER_SECOND;
				continue;
			}
			if (child.id !== EBML.CueTrackPositions || time == null) continue;
			const position = { track: -1, cluster: -1, relative: null as number | null };
			for (const field of childElements(cues, child.start, child.end)) {
				if (field.id === EBML.CueTrack) position.track = readUnsignedChild(cues, field);
				else if (field.id === EBML.CueClusterPosition) position.cluster = readUnsignedChild(cues, field);
				else if (field.id === EBML.CueRelativePosition) position.relative = readUnsignedChild(cues, field);
			}
			if (position.track === track && position.cluster >= 0) {
				points.push({ time, cluster: segmentStart + position.cluster, relative: position.relative });
			}
		}
	}
	return points.sort((a, b) => a.time - b.time);
}

/** Frame payload of a SimpleBlock or BlockGroup body, when it is an unlaced keyframe of `track`. */
function keyframePayload(id: number, body: Uint8Array, track: number) {
	let block = body;
	let isKeyframe = true;
	if (id === EBML.BlockGroup) {
		const children = [...childElements(body)];
		const inner = children.find((child) => child.id === EBML.Block);
		if (!inner) return null;
		block = body.subarray(inner.start, inner.end);
		isKeyframe = !children.some((child) => child.id === EBML.ReferenceBlock);
	}
	const trackNumber = readVint(block, 0, false);
	if (!trackNumber || trackNumber.value !== track) return null;
	const flags = block[trackNumber.length + 2]!;
	if (id === EBML.SimpleBlock) isKeyframe = (flags & SIMPLE_BLOCK_KEYFRAME) !== 0;
	if (!isKeyframe || flags & BLOCK_LACING) return null;
	return block.subarray(trackNumber.length + 3);
}

/**
 * Keyframes of a Matroska video track located through the file's Cues, so a preview
 * fetches the bytes of one block instead of the whole cluster around it.
 */
export class MatroskaKeyframes {
	private readAhead = MIN_READ_AHEAD;

	private constructor(
		private readonly reader: RangeReader,
		private readonly track: number,
		private readonly cues: CuePoint[],
	) {}

	static async open(reader: RangeReader, track: number): Promise<MatroskaKeyframes | null> {
		const head = await reader.read(0, HEAD_BYTES);
		const ebml = readElementAt(head, 0);
		if (ebml?.id !== EBML.EBML) return null;
		const segment = readElementAt(head, ebml.end);
		if (segment?.id !== EBML.Segment) return null;
		const segmentStart = ebml.end + segment.headerSize;

		let timestampScale = DEFAULT_TIMESTAMP_SCALE;
		let cuesAt: number | null = null;
		for (const element of childElements(head, segmentStart)) {
			if (element.id === EBML.SeekHead) {
				const cues = readSeekHead(head.subarray(element.start, element.end)).find(
					(entry) => entry.id === EBML.Cues,
				);
				if (cues) cuesAt = segmentStart + cues.position;
			} else if (element.id === EBML.Info) {
				const scale = [...childElements(head, element.start, element.end)].find(
					(child) => child.id === EBML.TimestampScale,
				);
				if (scale) timestampScale = readUnsignedChild(head, scale);
			} else if (element.id === EBML.Cluster) {
				break;
			}
		}
		if (cuesAt == null) return null;

		const cues = await readElement(reader, cuesAt, EBML.Cues);
		if (!cues) return null;
		const points = parseCues(cues, track, segmentStart, timestampScale);
		return points.length > 0 ? new MatroskaKeyframes(reader, track, points) : null;
	}

	keyframeAt(time: number): PreviewKeyframe | null {
		const cue = this.cueAt(time);
		return cue ? { timestamp: cue.time, read: () => this.readKeyframe(cue) } : null;
	}

	knownKeyframeAt(time: number) {
		return this.cueAt(time)?.time;
	}

	private cueAt(time: number) {
		let low = 0;
		let high = this.cues.length - 1;
		while (low < high) {
			const middle = (low + high + 1) >> 1;
			if (this.cues[middle]!.time <= time) low = middle;
			else high = middle - 1;
		}
		return this.cues[low];
	}

	/** Walks the cluster from the cued block (or its first block) to the track's keyframe. */
	private async readKeyframe(cue: CuePoint) {
		const window = ELEMENT_HEADER_BYTES + (cue.relative ?? 0) + this.readAhead;
		const cluster = readElementAt(await this.reader.read(cue.cluster, cue.cluster + ELEMENT_HEADER_BYTES, window), 0);
		if (cluster?.id !== EBML.Cluster || cluster.size == null) return null;
		const clusterEnd = cue.cluster + cluster.end;

		let position = cue.cluster + cluster.headerSize + (cue.relative ?? 0);
		while (position < clusterEnd) {
			const header = await this.reader.read(position, position + ELEMENT_HEADER_BYTES, this.readAhead);
			const element = readElementAt(header, 0);
			if (!element || element.size == null) return null;
			const bodyStart = position + element.headerSize;
			const end = position + element.end;
			if (element.id === EBML.SimpleBlock || element.id === EBML.BlockGroup) {
				const payload = keyframePayload(element.id, await this.reader.read(bodyStart, end, this.readAhead), this.track);
				if (payload) {
					this.readAhead = Math.max(this.readAhead, Math.ceil((end - position) * READ_AHEAD_MARGIN));
					return payload;
				}
			}
			position = end;
		}
		return null;
	}
}
