import type { ShowResponse } from "../../../lib/library/types/meta_types";
import { captureFrame } from "./videoSession";

export type LoadingBackdrop = { src: string | null; mode: "art" | "frame" };

export function episodeArtwork(metaData: ShowResponse | null, season: number | null, episode: number | null): LoadingBackdrop {
    const thumbnail =
        metaData?.meta?.type === "series"
            ? metaData.meta.videos?.find(
                  (video) => video.season === season && (video.episode === episode || video.number === episode),
              )?.thumbnail
            : null;
    return { src: thumbnail ?? null, mode: "art" };
}

/** Freezes the current frame so a seek or rebuffer shows the picture it left off on. */
export function captureBackdrop(
    video: HTMLVideoElement | undefined,
    canvas: HTMLCanvasElement | undefined,
    previous: LoadingBackdrop,
): LoadingBackdrop {
    if (video && canvas && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
        captureFrame(video, canvas);
    }
    if (canvas && canvas.width > 0 && canvas.height > 0) {
        try {
            return { src: canvas.toDataURL("image/jpeg", 0.72), mode: "frame" };
        } catch {
            // A cross-origin frame taints the canvas, so there is nothing to export.
        }
    }
    return previous.mode === "frame" && previous.src ? previous : { src: null, mode: "art" };
}
