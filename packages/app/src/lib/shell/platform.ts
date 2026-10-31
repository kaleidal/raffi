/**
 * Platform flags for Raffi shells (desktop Electron, Android TV, and web).
 */

export type PlatformName = "desktop" | "tv" | "web";

const hasWindow = typeof window !== "undefined";
const isDesktop = hasWindow && !!(window as { electronAPI?: unknown }).electronAPI;
const isTv = hasWindow && !!(window as { raffiTv?: unknown }).raffiTv;

export function getPlatformName(): PlatformName {
	if (isDesktop) return "desktop";
	return isTv ? "tv" : "web";
}

export const isWeb = !isDesktop && !isTv;
export const isDesktopPlatform = isDesktop;
export const isTvPlatform = isTv;
