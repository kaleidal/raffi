import { syncPost } from "../db/raffiSync";

function hostBlocksBrowsers(src: string) {
	try {
		const { hostname, pathname } = new URL(src);
		return hostname === "api.torbox.app" || (hostname === "torrentio.strem.fun" && pathname.startsWith("/resolve/"));
	} catch {
		return false;
	}
}

export const needsResolve = hostBlocksBrowsers;

/** The desktop app follows the redirects itself; the browser asks Raffi Sync, since it can't read across origins. */
export async function resolveBrowserStream(src: string) {
	try {
		const resolveOnDevice = window.electronAPI?.resolveStream;
		if (resolveOnDevice) return await resolveOnDevice(src);
		const { url } = await syncPost<{ url: string }>("/streams/resolve", { url: src });
		return url;
	} catch (error) {
		console.warn("Couldn't resolve the stream link", error);
		return src;
	}
}
