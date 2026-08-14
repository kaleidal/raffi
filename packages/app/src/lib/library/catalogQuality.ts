import type { PopularTitleMeta } from "./types/popular_types";

const INVALID_TITLE_NAMES = new Set([
    "#dupe#",
    "dupe",
    "#duplicate#",
    "unknown",
    "undefined",
    "null",
    "n/a",
]);

const cleanText = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, " ");

export const getCatalogTitleKey = (title: Pick<PopularTitleMeta, "imdb_id" | "id" | "type">) => {
    const id = cleanText(title.imdb_id || title.id).toLowerCase();
    return id ? `${title.type}:${id}` : "";
};

export function sanitizeCatalogTitle(title: PopularTitleMeta): PopularTitleMeta | null {
    const id = cleanText(title.imdb_id || title.id);
    const name = cleanText(title.name);
    const type = title.type === "series" ? "series" : title.type === "movie" ? "movie" : null;

    if (!id || !name || !type || INVALID_TITLE_NAMES.has(name.toLowerCase())) {
        return null;
    }

    const poster = cleanText(title.poster);
    const background = cleanText(title.background);
    const logo = cleanText(title.logo);

    return {
        ...title,
        id,
        imdb_id: id,
        name,
        type,
        poster: poster || undefined,
        background: background || undefined,
        logo: logo || undefined,
    };
}

export function sanitizeCatalogTitles(titles: PopularTitleMeta[]): PopularTitleMeta[] {
    const unique = new Map<string, PopularTitleMeta>();

    for (const title of titles) {
        const sanitized = sanitizeCatalogTitle(title);
        if (!sanitized) continue;

        const key = getCatalogTitleKey(sanitized);
        if (key && !unique.has(key)) unique.set(key, sanitized);
    }

    return Array.from(unique.values());
}
