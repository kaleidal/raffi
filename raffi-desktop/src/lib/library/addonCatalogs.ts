import type { Addon } from "../db/db";
import type { PopularTitleMeta } from "./types/popular_types";

const DEFAULT_SECTION_LIMIT = 12;
const DEFAULT_ITEMS_PER_SECTION = 20;
const REQUEST_TIMEOUT_MS = 9000;

type ManifestExtraProp = {
    name?: string;
    isRequired?: boolean;
    options?: string[];
};

type ManifestCatalog = {
    id?: string;
    type?: string;
    name?: string;
    extra?: ManifestExtraProp[];
    extraRequired?: string[];
    extraSupported?: string[];
};

type CatalogType = "movie" | "series";

type PlannedCatalog = {
    key: string;
    baseUrl: string;
    addonName: string;
    title: string;
    transportUrl: string;
    catalogId: string;
    catalogType: CatalogType;
};

export type AddonHomeSection = {
    id: string;
    title: string;
    titles: PopularTitleMeta[];
    addonName: string;
    transportUrl: string;
    catalogId: string;
    catalogType: CatalogType;
};

export type HeroCatalogSourceOption = {
    id: string;
    title: string;
    label: string;
    addonName: string;
    transportUrl: string;
    catalogs: { catalogId: string; catalogType: CatalogType }[];
};

function normalizeAddonBaseUrl(transportUrl: string) {
    return (transportUrl || "")
        .trim()
        .replace(/\/?manifest\.json$/i, "")
        .replace(/\/+$/, "");
}

function isSupportedCatalogType(type: string): type is CatalogType {
    return type === "movie" || type === "series";
}

function getCatalogExtraProps(catalog: ManifestCatalog): ManifestExtraProp[] {
    if (Array.isArray(catalog.extra)) {
        return catalog.extra.filter((item) => Boolean(item?.name));
    }

    const supported = Array.isArray(catalog.extraSupported)
        ? catalog.extraSupported.filter(Boolean)
        : [];
    const required = new Set(
        Array.isArray(catalog.extraRequired)
            ? catalog.extraRequired.filter(Boolean)
            : [],
    );

    return supported.map((name) => ({
        name,
        isRequired: required.has(name),
        options: [],
    }));
}

function catalogRequiresExtra(catalog: ManifestCatalog) {
    return getCatalogExtraProps(catalog).some((extra) => Boolean(extra.isRequired));
}

function buildCatalogTitle(catalog: ManifestCatalog) {
    const raw = typeof catalog.name === "string" && catalog.name.trim().length > 0
        ? catalog.name.trim()
        : String(catalog.id || "").replace(/[-_]+/g, " ").trim();

    if (!raw) return "Catalog";
    return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function formatCatalogType(type: string) {
    return type === "series" ? "Series" : "Movies";
}

function toPopularMeta(item: any, fallbackType: string): PopularTitleMeta | null {
    const id = String(item?.imdb_id ?? item?.id ?? "").trim();
    if (!id) return null;

    return {
        imdb_id: id,
        id,
        name: String(item?.name ?? "Unknown"),
        type: item?.type === "series" ? "series" : fallbackType === "series" ? "series" : "movie",
        popularities: item?.popularities ?? {},
        description: String(item?.description ?? ""),
        poster: item?.poster,
        genre: Array.isArray(item?.genre) ? item.genre : undefined,
        genres: Array.isArray(item?.genres) ? item.genres : undefined,
        imdbRating: item?.imdbRating,
        released: item?.released,
        slug: String(item?.slug ?? ""),
        year: item?.year,
        director: Array.isArray(item?.director) ? item.director : item?.director ?? null,
        writer: Array.isArray(item?.writer) ? item.writer : item?.writer ?? null,
        trailers: Array.isArray(item?.trailers) ? item.trailers : undefined,
        status: item?.status,
        background: item?.background,
        logo: item?.logo,
        popularity: item?.popularity,
        releaseInfo: item?.releaseInfo,
        trailerStreams: Array.isArray(item?.trailerStreams) ? item.trailerStreams : undefined,
        links: Array.isArray(item?.links) ? item.links : undefined,
        behaviorHints: item?.behaviorHints,
        awards: item?.awards,
        runtime: item?.runtime,
        dvdRelease: item?.dvdRelease,
        cast: Array.isArray(item?.cast) ? item.cast : undefined,
    };
}

async function fetchCatalog(baseUrl: string, type: string, catalogId: string) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const url = `${baseUrl}/catalog/${encodeURIComponent(type)}/${encodeURIComponent(catalogId)}.json`;
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                accept: "application/json",
                "user-agent": "RaffiDesktop/1.0",
            },
        });

        if (!response.ok) return [];

        const payload = await response.json();
        const metas = Array.isArray(payload?.metas) ? payload.metas : [];

        const mapped = metas
            .map((meta: any) => toPopularMeta(meta, type))
            .filter((meta: PopularTitleMeta | null): meta is PopularTitleMeta => meta !== null);

        const deduped = new Map<string, PopularTitleMeta>();
        for (const meta of mapped) {
            if (!deduped.has(meta.imdb_id)) deduped.set(meta.imdb_id, meta);
        }

        return Array.from(deduped.values());
    } catch {
        return [];
    } finally {
        clearTimeout(timeoutId);
    }
}

function planAddonCatalogs(addons: Addon[]): PlannedCatalog[] {
    return addons
        .flatMap((addon) => {
            const baseUrl = normalizeAddonBaseUrl(addon.transport_url);
            const addonName = String(addon?.manifest?.name ?? "Addon").trim() || "Addon";
            const catalogs: ManifestCatalog[] = Array.isArray(addon?.manifest?.catalogs)
                ? addon.manifest.catalogs
                : [];

            if (!baseUrl || catalogs.length === 0) return [];

            return catalogs
                .map((catalog) => {
                    const catalogId = String(catalog?.id ?? "").trim();
                    const catalogType = String(catalog?.type ?? "").trim();

                    if (!catalogId || !isSupportedCatalogType(catalogType)) return null;
                    if (catalogRequiresExtra(catalog)) return null;

                    return {
                        key: `${baseUrl}::${catalogType}::${catalogId}`,
                        baseUrl,
                        addonName,
                        title: buildCatalogTitle(catalog),
                        transportUrl: addon.transport_url,
                        catalogId,
                        catalogType,
                    };
                })
                .filter((item): item is NonNullable<typeof item> => item !== null);
        })
        .filter((item, index, list) => list.findIndex((other) => other.key === item.key) === index);
}

export function getHeroCatalogSourceOptions(addons: Addon[]): HeroCatalogSourceOption[] {
    const planned = planAddonCatalogs(addons);
    const grouped = new Map<string, HeroCatalogSourceOption>();

    for (const item of planned) {
        const key = `${item.baseUrl}::${item.title.toLowerCase()}`;
        const id = `addon:${key}`;
        const current = grouped.get(key);

        if (!current) {
            grouped.set(key, {
                id,
                title: item.title,
                label: `${item.title} (${item.addonName})`,
                addonName: item.addonName,
                transportUrl: item.transportUrl,
                catalogs: [
                    {
                        catalogId: item.catalogId,
                        catalogType: item.catalogType,
                    },
                ],
            });
            continue;
        }

        const exists = current.catalogs.some(
            (catalog) =>
                catalog.catalogId === item.catalogId &&
                catalog.catalogType === item.catalogType,
        );
        if (!exists) {
            current.catalogs = [
                ...current.catalogs,
                {
                    catalogId: item.catalogId,
                    catalogType: item.catalogType,
                },
            ];
        }
    }

    return Array.from(grouped.values()).sort((a, b) =>
        a.label.localeCompare(b.label),
    );
}

export async function fetchHeroTitlesFromCatalogSource(
    source: HeroCatalogSourceOption,
    maxItems = 80,
): Promise<PopularTitleMeta[]> {
    const baseUrl = normalizeAddonBaseUrl(source.transportUrl);
    if (!baseUrl) return [];

    const batches = await Promise.all(
        source.catalogs.map((catalog) =>
            fetchCatalog(baseUrl, catalog.catalogType, catalog.catalogId),
        ),
    );
    const deduped = new Map<string, PopularTitleMeta>();
    for (const batch of batches) {
        for (const title of batch) {
            if (!deduped.has(title.imdb_id)) {
                deduped.set(title.imdb_id, title);
            }
        }
    }
    return Array.from(deduped.values()).slice(0, maxItems);
}

export async function fetchAddonHomeSections(
    addons: Addon[],
    options?: { maxSections?: number; maxItemsPerSection?: number },
): Promise<AddonHomeSection[]> {
    const maxSections = options?.maxSections ?? DEFAULT_SECTION_LIMIT;
    const maxItemsPerSection = options?.maxItemsPerSection ?? DEFAULT_ITEMS_PER_SECTION;

    const planned = planAddonCatalogs(addons).slice(0, maxSections);

    const content = await Promise.all(
        planned.map(async (item) => {
            const titles = await fetchCatalog(item.baseUrl, item.catalogType, item.catalogId);
            return {
                ...item,
                titles: titles.slice(0, maxItemsPerSection),
            };
        }),
    );

    const nonEmpty = content.filter((item) => item.titles.length > 0);
    const baseTitleCounts = new Map<string, number>();
    for (const section of nonEmpty) {
        baseTitleCounts.set(
            section.title,
            (baseTitleCounts.get(section.title) ?? 0) + 1,
        );
    }

    const withTypeTitle = nonEmpty.map((section) => {
        if ((baseTitleCounts.get(section.title) ?? 0) <= 1) {
            return { ...section, resolvedTitle: section.title };
        }
        return {
            ...section,
            resolvedTitle: `${section.title} (${formatCatalogType(section.catalogType)})`,
        };
    });

    const resolvedTitleCounts = new Map<string, number>();
    for (const section of withTypeTitle) {
        resolvedTitleCounts.set(
            section.resolvedTitle,
            (resolvedTitleCounts.get(section.resolvedTitle) ?? 0) + 1,
        );
    }

    const withAddonTitle = withTypeTitle.map((section) => ({
        ...section,
        finalTitle:
            (resolvedTitleCounts.get(section.resolvedTitle) ?? 0) > 1
                ? `${section.resolvedTitle} • ${section.addonName}`
                : section.resolvedTitle,
    }));

    const finalTitleCounts = new Map<string, number>();
    for (const section of withAddonTitle) {
        finalTitleCounts.set(
            section.finalTitle,
            (finalTitleCounts.get(section.finalTitle) ?? 0) + 1,
        );
    }

    return withAddonTitle.map((section) => {
        const safeTitle =
            (finalTitleCounts.get(section.finalTitle) ?? 0) > 1
                ? `${section.finalTitle} • ${section.catalogId}`
                : section.finalTitle;

        return {
            id: section.key,
            title: safeTitle,
            titles: section.titles,
            addonName: section.addonName,
            transportUrl: section.transportUrl,
            catalogId: section.catalogId,
            catalogType: section.catalogType,
        };
    });
}
