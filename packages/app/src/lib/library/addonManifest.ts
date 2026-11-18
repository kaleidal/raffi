import type { Addon } from "../db/db";

export type CatalogType = "movie" | "series";

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
    const resources = Array.isArray(addon?.manifest?.resources)
        ? addon.manifest.resources
        : [];
    if (resources.length === 0) return true;
    return resources.some((resource: any) => {
        if (typeof resource === "string") {
            return resource.toLowerCase() === "catalog";
        }
        if (resource && typeof resource === "object") {
            return String(resource.name || "").toLowerCase() === "catalog";
        }
        return false;
    });
}

export function normalizeCatalogType(type: unknown): CatalogType | null {
    const value = String(type ?? "").trim().toLowerCase();
    if (value === "movie" || value === "series") return value;
    return null;
}
