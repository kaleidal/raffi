import type { Addon, AddonManifest } from "../db/types";
import { addonIdFor, offersSupportedResource } from "../library/addonManifest";


export interface StremioAddonDescriptor {
    transportUrl: string;
    manifest: Record<string, unknown>;
    flags?: Record<string, unknown>;
}

export interface StremioAddonImportResult {
    total: number;
    added: number;
    skipped: number;
    unsupported: number;
    warnings: string[];
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const normalizeStremioTransportUrl = (value: string) => {
    let trimmed = value.trim();
    if (!trimmed) return "";
    if (trimmed.startsWith("stremio://")) {
        trimmed = trimmed.replace("stremio://", "https://");
    }
    if (trimmed.endsWith("/manifest.json")) {
        return trimmed.replace(/\/manifest\.json$/i, "");
    }
    return trimmed.replace(/\/$/, "");
};

const manifestUrlForTransport = (transportUrl: string) =>
    `${transportUrl.replace(/\/$/, "")}/manifest.json`;

const readTransportUrl = (descriptor: Record<string, unknown>) => {
    const raw =
        (typeof descriptor.transportUrl === "string" && descriptor.transportUrl) ||
        (typeof descriptor.transport_url === "string" && descriptor.transport_url) ||
        "";
    return normalizeStremioTransportUrl(raw);
};

export const normalizeStremioAddonDescriptors = (raw: unknown): StremioAddonDescriptor[] => {
    const list = Array.isArray(raw)
        ? raw
        : isPlainObject(raw) && Array.isArray(raw.addons)
          ? raw.addons
          : [];

    const seen = new Set<string>();
    const descriptors: StremioAddonDescriptor[] = [];

    for (const entry of list) {
        if (!isPlainObject(entry)) continue;
        const transportUrl = readTransportUrl(entry);
        if (!transportUrl || seen.has(transportUrl)) continue;
        const manifest = isPlainObject(entry.manifest) ? entry.manifest : null;
        if (!manifest) continue;
        seen.add(transportUrl);
        descriptors.push({
            transportUrl,
            manifest,
            flags: isPlainObject(entry.flags) ? entry.flags : undefined,
        });
    }

    return descriptors;
};

export const parseStremioAddonsFromExport = (raw: string | unknown): StremioAddonDescriptor[] => {
    let parsed: unknown = raw;
    if (typeof raw === "string") {
        try {
            parsed = JSON.parse(raw);
        } catch {
            return [];
        }
    }
    if (!isPlainObject(parsed)) return [];
    return normalizeStremioAddonDescriptors(parsed.addons);
};

const isAddonManifest = (value: unknown): value is AddonManifest =>
    isPlainObject(value) && typeof value.id === "string" && typeof value.name === "string" && Array.isArray(value.resources);

const resolveManifest = async (transportUrl: string, manifest: unknown): Promise<AddonManifest | null> => {
    if (isAddonManifest(manifest)) return manifest;

    try {
        const response = await fetch(manifestUrlForTransport(transportUrl));
        if (!response.ok) return null;
        const fetched = await response.json();
        return isAddonManifest(fetched) ? fetched : null;
    } catch {
        return null;
    }
};

export const importStremioAddons = async (
    descriptors: StremioAddonDescriptor[],
    deps: {
        getAddons: () => Promise<Addon[]>;
        addAddon: (addon: Omit<Addon, "user_id" | "added_at" | "updated_at">) => Promise<Addon>;
        signal?: AbortSignal;
    },
): Promise<StremioAddonImportResult> => {
    const warnings: string[] = [];
    const existing = await deps.getAddons();
    const existingUrls = new Set(existing.map((addon) => addon.transport_url));

    let added = 0;
    let skipped = 0;
    let unsupported = 0;

    for (const descriptor of descriptors) {
        if (deps.signal?.aborted) {
            throw new Error("Import was cancelled.");
        }

        const transportUrl = normalizeStremioTransportUrl(descriptor.transportUrl);
        if (!transportUrl) continue;

        if (existingUrls.has(transportUrl)) {
            skipped += 1;
            continue;
        }

        const manifest = await resolveManifest(transportUrl, descriptor.manifest);
        if (!manifest || !offersSupportedResource(manifest)) {
            unsupported += 1;
            continue;
        }

        await deps.addAddon({
            transport_url: transportUrl,
            manifest,
            flags: {
                protected: false,
                official: false,
                ...(descriptor.flags || {}),
            },
            addon_id: addonIdFor(manifest.id),
        });

        existingUrls.add(transportUrl);
        added += 1;
    }

    if (descriptors.length === 0) {
        warnings.push("No addons were found in your Stremio account.");
    } else if (added === 0 && skipped === 0 && unsupported > 0) {
        warnings.push("Stremio addons were found, but none were compatible with Raffi.");
    }

    if (added > 0 && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("raffi:addons-changed"));
    }

    return {
        total: descriptors.length,
        added,
        skipped,
        unsupported,
        warnings,
    };
};
