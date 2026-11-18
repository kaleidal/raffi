import { getCachedMetaData } from "./metaCache";

const otherTitleType = (type: string) => (type === "movie" ? "series" : "movie");

export async function findCorrectedTitleType(
    imdbId: string,
    type: string,
    expectedName: string,
): Promise<string | null> {
    try {
        const metaData = await getCachedMetaData(imdbId, type);

        if (expectedName && metaData.meta.name !== expectedName) {
            console.warn(
                `Name mismatch: expected "${expectedName}", got "${metaData.meta.name}". Trying fallback type.`,
            );
        } else if (!metaData.meta.logo && !metaData.meta.background) {
            console.warn(
                "Missing logo or background. Trying fallback type.",
            );
        } else {
            return null;
        }
    } catch {
        console.warn(
            `Failed to load meta for ${type}, trying fallback`,
        );
    }

    const fallbackType = otherTitleType(type);
    try {
        const fallbackMeta = await getCachedMetaData(imdbId, fallbackType);
        return fallbackMeta && fallbackMeta.meta ? fallbackType : null;
    } catch (e) {
        console.error("Failed to load fallback meta", e);
        return null;
    }
}
