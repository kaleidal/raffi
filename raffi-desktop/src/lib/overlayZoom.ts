export const overlayZoomStyle =
    "transform: scale(var(--raffi-effective-zoom, 1)); transform-origin: top left; width: calc(100% / var(--raffi-effective-zoom, 1)); height: calc(100% / var(--raffi-effective-zoom, 1));";

export const withOverlayZoomStyle = (style = "") =>
    style ? `${overlayZoomStyle} ${style}` : overlayZoomStyle;