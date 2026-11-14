import { isAndroidPlatform, isDesktopPlatform } from "../../shell/platform";
import type { StreamHeaders } from "../types";

/**
 * IPTV servers rarely allow requests from a page, so desktop and Android fetch through the host,
 * which also sends the headers a playlist asks for and keeps HLS links pointing back at itself.
 */
const PROXY_BASE = isDesktopPlatform ? "raffi-live://fetch/" : isAndroidPlatform ? "/_live" : null;

export const proxied = PROXY_BASE !== null;

const isHttp = (url: string) => /^https?:\/\//i.test(url);

/** The address Raffi should request for `url`, which stays as it is wherever no proxy is needed. */
export function proxyUrl(url: string, headers?: StreamHeaders) {
	if (!PROXY_BASE || !isHttp(url)) return url;
	const params = new URLSearchParams({ url });
	if (headers?.userAgent) params.set("ua", headers.userAgent);
	if (headers?.referrer) params.set("referer", headers.referrer);
	return `${PROXY_BASE}?${params}`;
}

/** Logos load straight from their server on Android and the web; desktop runs on a secure origin, which would upgrade plain http images. */
export const logoUrl = (url: string | undefined) => (url && isDesktopPlatform ? proxyUrl(url) : url);

const PROXY_UNREACHABLE = 523;
const PROXY_BAD_CERTIFICATE = 526;

const sentence = (text: string) => text[0].toUpperCase() + text.slice(1);

/** What went wrong reaching `server`, from the status it or the proxy answered with. */
export function describeStatus(status: number, server: string) {
	if (status === PROXY_UNREACHABLE) return `Couldn't reach ${server}.`;
	if (status === PROXY_BAD_CERTIFICATE) return `${sentence(server)} has a broken security certificate.`;
	if (status === 401 || status === 403) return `${sentence(server)} turned the request down.`;
	if (status === 404) return `${sentence(server)} doesn't have this anymore.`;
	return `${sentence(server)} answered with an error (${status}).`;
}
