import { openExternal } from "../../../lib/shell/openExternal";
export const HOME_REFRESH_EVENT = "raffi:home-refresh";
export const ADDONS_CHANGED_EVENT = "raffi:addons-changed";

export const RESOURCE_LABELS: Record<string, string> = {
	stream: "Streams",
	subtitles: "Subtitles",
	catalog: "Catalogs",
	meta: "Metadata",
};

export const normalizeTransportUrl = (url: string) =>
	url.endsWith("/manifest.json")
		? url.replace(/\/manifest\.json$/i, "")
		: url;

export const formatResourceName = (name: string): string =>
	RESOURCE_LABELS[name] ?? `${name.charAt(0).toUpperCase()}${name.slice(1)}`;

export const buildConfigureUrl = (url: string | undefined) => {
	if (!url) return null;
	const trimmed = url.trim();
	if (!trimmed) return null;
	if (/manifest\.json\/?$/i.test(trimmed)) {
		return trimmed.replace(/manifest\.json\/?$/i, "configure");
	}
	if (trimmed.endsWith("/configure")) return trimmed;
	return `${trimmed.replace(/\/$/, "")}/configure`;
};

export const openConfigureUrl = (url: string | undefined) => {
	const target = buildConfigureUrl(url);
	if (!target) return null;

	void openExternal(target);
	return target;
};
