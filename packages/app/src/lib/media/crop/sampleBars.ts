import type { SeekPreview } from "../preview/seekPreview";
import { detectContentRect, type ContentRect, type FramePixels } from "./barDetection";

/** Spread across the video, clear of opening titles and end credits. */
const SAMPLE_POINTS = [0.12, 0.24, 0.36, 0.48, 0.6, 0.72, 0.84];

function pixelsOf(bitmap: ImageBitmap): FramePixels {
    const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d", { willReadFrequently: true })!;
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, bitmap.width, bitmap.height);
}

/** The bars baked into a video, read from seek thumbnails so playback is never touched. */
export async function detectBars(preview: SeekPreview, duration: number): Promise<ContentRect | null> {
    const frames: FramePixels[] = [];
    for (const point of SAMPLE_POINTS) {
        const time = duration * point;
        const bitmap = preview.peek(time) ?? (await preview.frameAt(time));
        if (bitmap?.width) frames.push(pixelsOf(bitmap));
    }
    return detectContentRect(frames);
}
