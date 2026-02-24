export const HOME_REFRESH_EVENT = "raffi:home-refresh";
export const ADDONS_CHANGED_EVENT = "raffi:addons-changed";

export const RESOURCE_LABELS: Record<string, string> = {
	stream: "Streams",
	subtitles: "Subtitles",
	catalog: "Catalogs",
	meta: "Metadata",
};

export const SUPPORTED_RESOURCES = new Set(["stream", "subtitles", "catalog", "meta"]);

export const normalizeTransportUrl = (url: string) =>
	url.endsWith("/manifest.json")
		? url.replace(/\/manifest\.json$/i, "")
		: url;

export const matchesResource = (manifest: any, predicate: (name: string) => boolean) => {
	const resources = manifest?.resources ?? [];
	return resources.some((resource: any) => {
		if (typeof resource === "string") {
			return predicate(resource.toLowerCase());
		}
		if (resource && typeof resource === "object") {
			return predicate(String(resource.name || "").toLowerCase());
		}
		return false;
	});
};

export const getResourceNames = (manifest: any): string[] => {
	const resources = manifest?.resources ?? [];
	const names = resources
		.map((resource: any) => {
			if (typeof resource === "string") return resource.toLowerCase();
			if (resource && typeof resource === "object") {
				return String(resource.name || "").toLowerCase();
			}
			return "";
		})
		.filter((name: string) => name.length > 0);
	return Array.from(new Set(names));
};

export const formatResourceName = (name: string): string =>
	RESOURCE_LABELS[name] ?? `${name.charAt(0).toUpperCase()}${name.slice(1)}`;

export const hasSupportedResource = (manifest: any) =>
	matchesResource(manifest, (name) => SUPPORTED_RESOURCES.has(name));

export const supportsResource = (
	manifest: any,
	target: "stream" | "subtitles" | "catalog" | "meta",
) => matchesResource(manifest, (name) => name === target);

export const isUuid = (value: unknown): value is string => {
	if (typeof value !== "string") return false;
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
		value,
	);
};

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
