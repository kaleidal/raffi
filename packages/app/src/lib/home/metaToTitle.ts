import type { ShowResponse } from "../library/types/meta_types";
import type { PopularTitleMeta } from "../library/types/popular_types";
import { extractYouTubeId } from "./trailers";

function getTrailerStreamsFromMeta(meta: ShowResponse["meta"]) {
    const richMeta = meta as any;
    if (Array.isArray(richMeta?.trailerStreams) && richMeta.trailerStreams.length > 0) {
        return richMeta.trailerStreams
            .map((entry: any) => ({
                title: String(entry?.title || meta.name || "Trailer"),
                ytId: String(entry?.ytId || "").trim(),
            }))
            .filter((entry: any) => /^[A-Za-z0-9_-]{11}$/.test(entry.ytId));
    }

    const trailers = Array.isArray(meta.trailers) ? meta.trailers : [];
    return trailers
        .map((trailer) => {
            const ytId = extractYouTubeId((trailer as any)?.source);
            if (!ytId) return null;
            return {
                title: String(meta.name || "Trailer"),
                ytId,
            };
        })
        .filter((entry): entry is { title: string; ytId: string } => entry !== null);
}

export function mapMetaToPopular(meta: ShowResponse["meta"]): PopularTitleMeta {
    const normalizedType = meta.type === "series" ? "series" : "movie";
    const richMeta = meta as any;
    return {
        imdb_id: meta.imdb_id,
        id: meta.id || meta.imdb_id,
        name: meta.name || "Unknown",
        type: normalizedType,
        popularities: { ...(meta.popularities ?? {}) },
        description: meta.description || "",
        poster: meta.poster || undefined,
        genre: Array.isArray(meta.genre) ? meta.genre : undefined,
        genres: Array.isArray(meta.genres) ? meta.genres : undefined,
        imdbRating: meta.imdbRating || undefined,
        released: meta.released || undefined,
        slug: meta.slug || "",
        year: meta.year || undefined,
        director: Array.isArray(meta.director)
            ? meta.director
            : meta.director
                ? [meta.director]
                : null,
        writer: Array.isArray(meta.writer) ? meta.writer : null,
        trailers: Array.isArray(meta.trailers) ? meta.trailers : undefined,
        status: meta.status || undefined,
        background: meta.background || undefined,
        logo: meta.logo || undefined,
        popularity: meta.popularity,
        releaseInfo: meta.releaseInfo || undefined,
        trailerStreams: getTrailerStreamsFromMeta(meta),
        links: Array.isArray(richMeta?.links) ? richMeta.links : undefined,
        behaviorHints: richMeta?.behaviorHints,
        awards: meta.awards || undefined,
        runtime: meta.runtime || undefined,
        dvdRelease: meta.dvdRelease || undefined,
        cast: Array.isArray(meta.cast) ? meta.cast : undefined,
    };
}
