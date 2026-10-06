import type { Chapter, ChapterKind } from "../../../pages/player/types";

export type TimeRange = { start: number; end: number };

/** A stretch of the bar between chapter boundaries, positioned in bar fractions (0–1). */
export type TrackSegment = {
	left: number;
	right: number;
	kind: ChapterKind | null;
	isFirst: boolean;
	isLast: boolean;
};

export type SegmentFill = { left: number; width: number };

const MIN_SEGMENT_FRACTION = 0.004;

export const KIND_COLORS: Partial<Record<ChapterKind, string>> = {
	intro: "59,130,246",
	recap: "245,158,11",
	outro: "168,85,247",
};

/** Maps a media time to its position on the bar; the remaining-time style runs right to left. */
export const timeToFraction = (time: number, duration: number, inverted: boolean) => {
	const fraction = duration > 0 ? Math.min(1, Math.max(0, time / duration)) : 0;
	return inverted ? 1 - fraction : fraction;
};

export const fractionToTime = (fraction: number, duration: number, inverted: boolean) =>
	(inverted ? 1 - fraction : fraction) * duration;

function rangeToFractions(range: TimeRange, duration: number, inverted: boolean): [number, number] {
	const a = timeToFraction(range.start, duration, inverted);
	const b = timeToFraction(range.end, duration, inverted);
	return a < b ? [a, b] : [b, a];
}

/** Splits the timeline at chapter boundaries, filling uncovered time with plain segments. */
export function trackSegments(chapters: Chapter[], duration: number, inverted: boolean): TrackSegment[] {
	if (duration <= 0) return [];
	const minLength = duration * MIN_SEGMENT_FRACTION;
	const marked = chapters
		.map((chapter) => ({
			start: Math.max(0, chapter.startTime),
			end: Math.min(duration, chapter.kind === "outro" ? duration : chapter.endTime),
			kind: chapter.kind ?? null,
		}))
		.filter((chapter) => chapter.end - chapter.start >= minLength)
		.sort((a, b) => a.start - b.start);

	const ranges: Array<TimeRange & { kind: ChapterKind | null }> = [];
	let cursor = 0;
	for (const chapter of marked) {
		const gapEnd = Math.max(cursor, chapter.start);
		const start = gapEnd - cursor >= minLength ? gapEnd : cursor;
		if (chapter.end - start < minLength) continue;
		if (start > cursor) ranges.push({ start: cursor, end: start, kind: null });
		ranges.push({ start, end: chapter.end, kind: chapter.kind });
		cursor = chapter.end;
	}
	if (duration - cursor >= minLength || ranges.length === 0) ranges.push({ start: cursor, end: duration, kind: null });
	else ranges.at(-1)!.end = duration;

	const segments = ranges
		.map((range) => {
			const [left, right] = rangeToFractions(range, duration, inverted);
			return { left, right, kind: range.kind };
		})
		.sort((a, b) => a.left - b.left);
	return segments.map((segment, index) => ({
		...segment,
		isFirst: index === 0,
		isLast: index === segments.length - 1,
	}));
}

/** Where a bar interval falls inside a segment, as fractions of the segment's width. */
export function fillWithin(segment: TrackSegment, from: number, to: number): SegmentFill | null {
	const span = segment.right - segment.left;
	const left = Math.max(from, segment.left);
	const right = Math.min(to, segment.right);
	if (span <= 0 || right <= left) return null;
	return { left: (left - segment.left) / span, width: (right - left) / span };
}

export function bufferedFractions(ranges: TimeRange[], duration: number, inverted: boolean) {
	return ranges.map((range) => rangeToFractions(range, duration, inverted));
}

/** The media element's buffered ranges, reusing `previous` when nothing changed. */
export function readBufferedRanges(buffered: TimeRanges, previous: TimeRange[]): TimeRange[] {
	const unchanged =
		buffered.length === previous.length &&
		previous.every((range, index) => range.start === buffered.start(index) && range.end === buffered.end(index));
	if (unchanged) return previous;
	return Array.from({ length: buffered.length }, (_, index) => ({
		start: buffered.start(index),
		end: buffered.end(index),
	}));
}
