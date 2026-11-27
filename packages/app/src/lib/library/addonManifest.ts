import type { Addon } from "../db/db";

export type CatalogType = "movie" | "series";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** The manifest's own id when it is a UUID, which the sync service requires, otherwise a fresh one. */
export const addonIdFor = (manifestId: unknown) =>
    typeof manifestId === "string" && UUID.test(manifestId) ? manifestId : crypto.randomUUID();

export type ResourceName = "stream" | "subtitles" | "catalog" | "meta";

export const SUPPORTED_RESOURCES = new Set<string>(["stream", "subtitles", "catalog", "meta"]);

/** Lower-cased resource names, read leniently because community and imported manifests are not always well-formed. */
export function resourceNames(manifest: { resources?: unknown } | null | undefined): string[] {
    const resources: unknown[] = Array.isArray(manifest?.resources) ? manifest.resources : [];
    const names = resources.map((resource) =>
        String(typeof resource === "string" ? resource : (resource as { name?: unknown } | null)?.name ?? "").toLowerCase(),
    );
    return Array.from(new Set(names.filter(Boolean)));
}

export const offersResource = (manifest: { resources?: unknown } | null | undefined, name: ResourceName) =>
    resourceNames(manifest).includes(name);

export const offersSupportedResource = (manifest: { resources?: unknown } | null | undefined) =>
    resourceNames(manifest).some((name) => SUPPORTED_RESOURCES.has(name));

export function normalizeAddonBaseUrl(transportUrl: string) {
    return (transportUrl || "")
        .trim()
        .replace(/\/?manifest\.json$/i, "")
        .replace(/\/+$/, "");
}

function matchesType(supportedTypes: unknown, type: CatalogType) {
    if (!Array.isArray(supportedTypes) || supportedTypes.length === 0) return true;
    return supportedTypes.some(
        (entry) => String(entry || "").toLowerCase().trim() === type,
    );
}

function matchesIdPrefix(prefixes: unknown, id: string) {
    if (!Array.isArray(prefixes) || prefixes.length === 0) return true;
    const normalizedId = (id || "").toLowerCase();
    return prefixes.some((prefix) =>
        normalizedId.startsWith(String(prefix || "").toLowerCase().trim()),
    );
}

type ResourceDescriptor = {
    name: string;
    types?: unknown;
    idPrefixes?: unknown;
};

function getResourceDescriptors(manifest: any): ResourceDescriptor[] {
    const resources: unknown[] = Array.isArray(manifest?.resources) ? manifest.resources : [];
    const defaultTypes = manifest?.types;
    const defaultPrefixes = manifest?.idPrefixes;

    return resources.reduce<ResourceDescriptor[]>((descriptors, resource) => {
            if (typeof resource === "string") {
                descriptors.push({
                    name: resource.toLowerCase(),
                    types: defaultTypes,
                    idPrefixes: defaultPrefixes,
                });
                return descriptors;
            }
            if (resource && typeof resource === "object") {
                const descriptor = resource as ResourceDescriptor;
                descriptors.push({
                    name: String(descriptor.name || "").toLowerCase(),
                    types: descriptor.types ?? defaultTypes,
                    idPrefixes: descriptor.idPrefixes ?? defaultPrefixes,
                });
            }
            return descriptors;
        }, []);
}

export function addonSupportsMeta(addon: Addon, id: string, type: CatalogType) {
    const descriptors = getResourceDescriptors(addon?.manifest).filter(
        (descriptor) => descriptor.name === "meta",
    );

    if (descriptors.length === 0) return false;
    return descriptors.some(
        (descriptor) =>
            matchesType(descriptor.types, type) &&
            matchesIdPrefix(descriptor.idPrefixes, id),
    );
}

export function addonHasCatalogResource(addon: Addon) {
    const names = resourceNames(addon.manifest);
    return names.length === 0 || names.includes("catalog");
}

export function normalizeCatalogType(type: unknown): CatalogType | null {
    const value = String(type ?? "").trim().toLowerCase();
    if (value === "movie" || value === "series") return value;
    return null;
}
