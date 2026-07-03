import type { Addon } from "../db/types";
import type { StremioAddonDescriptor } from "./stremioAddons";
import {
    hasSupportedStremioAddonResources,
    normalizeStremioTransportUrl,
} from "./stremioAddons";
import type { StremioImportPreviewItem } from "./stremioImport";

export interface StremioAddonPreviewItem {
    id: string;
    name: string;
    transportUrl: string;
    resources: string[];
    alreadyInstalled: boolean;
    supported: boolean;
    descriptor: StremioAddonDescriptor;
}

export interface StremioImportPreview {
    authKey: string;
    email: string;
    libraryItems: StremioImportPreviewItem[];
    addons: StremioAddonPreviewItem[];
    warnings: string[];
    rawCount: number;
}

const readAddonResources = (manifest: Record<string, unknown>): string[] => {
    const resources = Array.isArray(manifest.resources) ? manifest.resources : [];
    const names = resources
        .map((resource) => {
            if (typeof resource === "string") return resource.toLowerCase();
            if (resource && typeof resource === "object" && "name" in resource) {
                return String((resource as { name?: string }).name || "").toLowerCase();
            }
            return "";
        })
        .filter(Boolean);
    return Array.from(new Set(names));
};

export const buildStremioAddonPreviewItems = (
    descriptors: StremioAddonDescriptor[],
    existingAddons: Addon[],
): StremioAddonPreviewItem[] => {
    const existingUrls = new Set(
        existingAddons.map((addon) => normalizeStremioTransportUrl(addon.transport_url)),
    );

    return descriptors.map((descriptor) => {
        const transportUrl = normalizeStremioTransportUrl(descriptor.transportUrl);
        const manifest = descriptor.manifest;
        const name =
            typeof manifest.name === "string" && manifest.name.trim()
                ? manifest.name.trim()
                : transportUrl;
        const supported = hasSupportedStremioAddonResources(manifest);

        return {
            id: transportUrl,
            name,
            transportUrl,
            resources: readAddonResources(manifest),
            alreadyInstalled: existingUrls.has(transportUrl),
            supported,
            descriptor,
        };
    });
};

export const defaultSelectedLibraryIds = (items: StremioImportPreviewItem[]) =>
    new Set(items.map((item) => item.imdbId));

export const defaultSelectedAddonIds = (items: StremioAddonPreviewItem[]) =>
    new Set(
        items
            .filter((item) => item.supported && !item.alreadyInstalled)
            .map((item) => item.id),
    );
