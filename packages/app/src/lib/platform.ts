/**
 * Platform flags for Raffi shells (desktop Electron vs web).
 */

export type PlatformName = "desktop" | "web";

const isDesktop =
	typeof window !== "undefined" && !!(window as { electronAPI?: unknown }).electronAPI;

export function getPlatformName(): PlatformName {
	return isDesktop ? "desktop" : "web";
}

export const isWeb = !isDesktop;
export const isDesktopPlatform = isDesktop;
