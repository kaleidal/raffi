/**
 * Platform flags for Raffi shells (desktop Electron, the Android app, and web).
 */

export type PlatformName = "desktop" | "android" | "web";

const hasWindow = typeof window !== "undefined";
const isDesktop = hasWindow && !!(window as { electronAPI?: unknown }).electronAPI;
const isAndroid = hasWindow && !!(window as { raffiAndroid?: unknown }).raffiAndroid;
/** The Android host loads the page with `?device=tv` on TVs, which are driven by a remote rather than touch. */
const isTv = isAndroid && new URLSearchParams(window.location.search).get("device") === "tv";

export function getPlatformName(): PlatformName {
	if (isDesktop) return "desktop";
	return isAndroid ? "android" : "web";
}

export const isWeb = !isDesktop && !isAndroid;
export const isDesktopPlatform = isDesktop;
export const isAndroidPlatform = isAndroid;
export const isTvPlatform = isTv;
