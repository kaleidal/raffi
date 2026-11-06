import { syncPost } from "../db/raffiSync";
import { isWeb } from "../shell/platform";

function hostBlocksBrowsers(src: string) {
	try {
		const { hostname, pathname } = new URL(src);
		return hostname === "api.torbox.app" || (hostname === "torrentio.strem.fun" && pathname.startsWith("/resolve/"));
	} catch {
		return false;
	}
}

export const needsServerResolve = (src: string) => isWeb && hostBlocksBrowsers(src);

export async function resolveBrowserStream(src: string) {
	try {
		const { url } = await syncPost<{ url: string }>("/streams/resolve", { url: src });
		return url;
	} catch (error) {
		console.warn("Couldn't resolve the stream link", error);
		return src;
	}
}
