export const overlayZoomStyle =
    "transform: scale(var(--raffi-effective-zoom, 1)); transform-origin: top left; width: calc(100% / var(--raffi-effective-zoom, 1)); height: calc(100% / var(--raffi-effective-zoom, 1));";

export const withOverlayZoomStyle = (style = "") =>
    style ? `${overlayZoomStyle} ${style}` : overlayZoomStyle;

export function getEffectiveOverlayZoom() {
    if (typeof document === "undefined") return 1;
    const zoom = Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--raffi-effective-zoom") || "1",
    );
    return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
}
