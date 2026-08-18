/** Convert OS filesystem paths into MediaBunny-fetchable URLs on desktop. */

const LOCAL_MEDIA_SCHEME = "raffi-media:";

export function isHttpUrl(src: string): boolean {
	return /^https?:\/\//i.test(src);
}

export function isMagnetUrl(src: string): boolean {
	return /^magnet:/i.test(src);
}

export function isLocalMediaUrl(src: string): boolean {
	return /^raffi-media:/i.test(src);
}

/** Absolute filesystem path (no scheme), e.g. Windows `C:\...` or POSIX `/...`. */
export function isLocalFilesystemPath(src: string): boolean {
	if (!src || typeof src !== "string") return false;
	if (isHttpUrl(src) || isMagnetUrl(src) || isLocalMediaUrl(src)) return false;
	if (src.includes("://")) return false;
	if (/^[a-zA-Z]:[\\/]/.test(src)) return true;
	if (src.startsWith("\\\\")) return true;
	if (src.startsWith("/")) return true;
	return false;
}

export async function toClientPlayableUrl(src: string): Promise<string> {
	if (!src) return src;
	if (isHttpUrl(src) || isLocalMediaUrl(src) || isMagnetUrl(src)) return src;
	if (!isLocalFilesystemPath(src)) return src;
	if (typeof window !== "undefined" && window.electronAPI?.localLibrary?.resolve) {
		return window.electronAPI.localLibrary.resolve(src);
	}
	return src;
}

export function canTryClientPlayback(src: string): boolean {
	if (!src) return false;
	if (isMagnetUrl(src)) return false;
	if (/\.m3u8(\?|$)/i.test(src)) return true;
	if (isHttpUrl(src) || isLocalMediaUrl(src)) return true;
	return isLocalFilesystemPath(src) && typeof window !== "undefined" && Boolean(window.electronAPI);
}

export { LOCAL_MEDIA_SCHEME };
