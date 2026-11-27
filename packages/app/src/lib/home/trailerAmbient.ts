import { setRestingAmbient } from "./ambient";

const SAMPLE_INTERVAL_MS = 700;
/** The part of the trailer that's opaque video, clear of the logo on the left and the fade at the bottom. */
const SAMPLE_AREA = { left: 0.4, top: 0.1, right: 1, bottom: 0.6 };

/** Tints the home page from the frames the hero trailer is showing; only the desktop app can read its own window. */
export function followTrailerColours(getTrailer: () => HTMLIFrameElement | undefined, isPlaying: () => boolean) {
    const sampleRegion = window.electronAPI?.sampleRegion;
    if (!sampleRegion) return () => {};

    const sample = async () => {
        const trailer = getTrailer();
        if (!trailer || !isPlaying() || document.hidden) return;
        const bounds = trailer.getBoundingClientRect();
        const x = Math.max(0, Math.round(bounds.left + bounds.width * SAMPLE_AREA.left));
        const y = Math.max(0, Math.round(bounds.top + bounds.height * SAMPLE_AREA.top));
        const right = Math.min(window.innerWidth, Math.round(bounds.left + bounds.width * SAMPLE_AREA.right));
        const bottom = Math.min(window.innerHeight, Math.round(bounds.top + bounds.height * SAMPLE_AREA.bottom));
        if (right - x < 16 || bottom - y < 16) return;
        const frame = await sampleRegion({ x, y, width: right - x, height: bottom - y });
        if (frame) setRestingAmbient(frame, true);
    };

    const timer = setInterval(sample, SAMPLE_INTERVAL_MS);
    return () => clearInterval(timer);
}
