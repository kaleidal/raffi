import type { ContentRect } from "../../../../lib/media/crop/barDetection";

/** Fills the frame instead of fitting it when that would hide less than this share of the picture. */
const FILL_TOLERANCE = 0.02;

type Size = { width: number; height: number };

export type VideoBox = { left: number; top: number; width: number; height: number };

/** Where to place the video so its picture, without the bars baked into it, fits the container. */
export function videoBox(container: Size, video: Size, crop: ContentRect): VideoBox | null {
    if (!container.width || !container.height || !video.width || !video.height) return null;
    const pictureWidth = video.width * (crop.right - crop.left);
    const pictureHeight = video.height * (crop.bottom - crop.top);
    const fit = Math.min(container.width / pictureWidth, container.height / pictureHeight);
    const fill = Math.max(container.width / pictureWidth, container.height / pictureHeight);
    const scale = 1 - fit / fill <= FILL_TOLERANCE ? fill : fit;
    return {
        width: video.width * scale,
        height: video.height * scale,
        left: (container.width - pictureWidth * scale) / 2 - crop.left * video.width * scale,
        top: (container.height - pictureHeight * scale) / 2 - crop.top * video.height * scale,
    };
}

export const pictureAspect = (video: Size, crop: ContentRect) =>
    (video.width * (crop.right - crop.left)) / (video.height * (crop.bottom - crop.top));
