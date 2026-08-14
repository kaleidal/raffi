import { describe, expect, test } from "bun:test";
import {
    getCatalogTitleKey,
    sanitizeCatalogTitle,
    sanitizeCatalogTitles,
} from "../src/lib/library/catalogQuality";
import type { PopularTitleMeta } from "../src/lib/library/types/popular_types";

const title = (overrides: Partial<PopularTitleMeta> = {}): PopularTitleMeta => ({
    imdb_id: "tt1234567",
    id: "tt1234567",
    name: "A Real Movie",
    type: "movie",
    popularities: {},
    description: "",
    slug: "a-real-movie",
    ...overrides,
});

describe("catalog title quality", () => {
    test("drops malformed catalog placeholders", () => {
        expect(sanitizeCatalogTitle(title({ name: " #DUPE# " }))).toBeNull();
        expect(sanitizeCatalogTitle(title({ imdb_id: "", id: "" }))).toBeNull();
    });

    test("normalizes presentation fields without requiring a poster", () => {
        expect(
            sanitizeCatalogTitle(
                title({ name: "  A   Real   Movie  ", poster: "   ", logo: " logo.png " }),
            ),
        ).toMatchObject({
            name: "A Real Movie",
            poster: undefined,
            logo: "logo.png",
        });
    });

    test("deduplicates by media type and canonical id", () => {
        const movie = title();
        const duplicate = title({ name: "Duplicate source entry" });
        const series = title({ type: "series" });

        expect(sanitizeCatalogTitles([movie, duplicate, series])).toEqual([movie, series]);
        expect(getCatalogTitleKey(movie)).toBe("movie:tt1234567");
    });
});
