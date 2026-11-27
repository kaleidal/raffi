/** The part of a frame that holds picture, as fractions of its width and height. */
export type ContentRect = { left: number; top: number; right: number; bottom: number };

export type FramePixels = { data: Uint8ClampedArray; width: number; height: number };

export const FULL_FRAME: ContentRect = { left: 0, top: 0, right: 1, bottom: 1 };

/** Brighter than this counts as picture; encoders rarely keep bars at true zero. */
const BLACK_LUMA = 26;
/** A line with more lit pixels than this share is picture, which keeps subtitles and logos in a bar. */
const MAX_LIT_SHARE = 0.015;
/** Frames darker than this on average say nothing about where the bars are. */
const DARK_FRAME_LUMA = 14;
/** Bars thinner than this are encoder edges, not letterboxing. */
const MIN_BAR = 0.025;
const MIN_FRAMES = 4;

const luma = (data: Uint8ClampedArray, index: number) => (data[index] * 54 + data[index + 1] * 183 + data[index + 2] * 19) >> 8;

function litRows({ data, width, height }: FramePixels) {
    const rows = new Uint32Array(height);
    const columns = new Uint32Array(width);
    let total = 0;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const value = luma(data, (y * width + x) * 4);
            total += value;
            if (value > BLACK_LUMA) {
                rows[y]++;
                columns[x]++;
            }
        }
    }
    return { rows, columns, mean: total / (width * height) };
}

const firstLit = (counts: Uint32Array, limit: number) => counts.findIndex((count) => count > limit);

function lastLit(counts: Uint32Array, limit: number) {
    for (let index = counts.length - 1; index >= 0; index--) if (counts[index] > limit) return index;
    return -1;
}

/** Where the picture sits in one frame, or null when the frame is too dark to tell. */
export function frameContent(frame: FramePixels): ContentRect | null {
    const { rows, columns, mean } = litRows(frame);
    if (mean < DARK_FRAME_LUMA) return null;
    const top = firstLit(rows, frame.width * MAX_LIT_SHARE);
    const left = firstLit(columns, frame.height * MAX_LIT_SHARE);
    if (top < 0 || left < 0) return null;
    return {
        left: left / frame.width,
        top: top / frame.height,
        right: (lastLit(columns, frame.height * MAX_LIT_SHARE) + 1) / frame.width,
        bottom: (lastLit(rows, frame.width * MAX_LIT_SHARE) + 1) / frame.height,
    };
}

/**
 * The bars baked into a video, judged across frames from all over it. Only what every frame
 * agrees is black gets cropped, so scenes that change shape or put text in a bar keep it.
 */
export function detectContentRect(frames: FramePixels[]): ContentRect | null {
    const rects = frames.map(frameContent).filter((rect) => rect !== null);
    if (rects.length < MIN_FRAMES) return null;

    const bar = (size: number) => (size >= MIN_BAR ? size : 0);
    const vertical = bar(Math.min(...rects.map((rect) => Math.min(rect.top, 1 - rect.bottom))));
    const horizontal = bar(Math.min(...rects.map((rect) => Math.min(rect.left, 1 - rect.right))));
    if (!vertical && !horizontal) return null;

    return { left: horizontal, top: vertical, right: 1 - horizontal, bottom: 1 - vertical };
}
