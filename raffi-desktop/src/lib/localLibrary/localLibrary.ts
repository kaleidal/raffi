import { searchTitles } from "../library/library";

export type LocalParsed =
    | {
          kind: "episode";
          title: string;
          season: number;
          episode: number;
      }
    | {
          kind: "movie";
          title: string;
      };

export type ScannedLocalFile = {
    path: string;
    parsed: LocalParsed;
};

export type LocalIndexEntry = {
    imdbId: string;
    type: "series" | "movie";
    filePath: string;
    displayTitle: string;
    season?: number;
    episode?: number;
    addedAt: number;
};

const ROOTS_KEY = "localLibrary:roots";
const INDEX_KEY = "localLibrary:index:v1";
const MAPPING_KEY = "localLibrary:titleMapping:v1";

function isElectron(): boolean {
    return typeof window !== "undefined" && !!(window as any).electronAPI;
}

function normalizeTitle(value: string): string {
    return (value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function scoreTitleMatch(candidate: string, desired: string): number {
    const c = normalizeTitle(candidate);
    const d = normalizeTitle(desired);
    if (!c || !d) return 0;
    if (c === d) return 100;

    const cTokens = new Set(c.split(" ").filter(Boolean));
    const dTokens = new Set(d.split(" ").filter(Boolean));
    let overlap = 0;
    for (const t of dTokens) {
        if (cTokens.has(t)) overlap += 1;
    }
    return overlap;
}

function loadJson<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

function saveJson(key: string, value: any) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // ignore
    }
}

export function getRoots(): string[] {
    return loadJson<string[]>(ROOTS_KEY, []);
}

export function setRoots(roots: string[]) {
    const unique = Array.from(new Set((roots || []).filter(Boolean)));
    saveJson(ROOTS_KEY, unique);
}

export function getIndex(): LocalIndexEntry[] {
    return loadJson<LocalIndexEntry[]>(INDEX_KEY, []);
}

function setIndex(entries: LocalIndexEntry[]) {
    saveJson(INDEX_KEY, entries);
}

type TitleMapping = Record<string, string>; // key: `${type}:${normalizedTitle}` -> imdbId

function getMappingKey(type: "movie" | "series", title: string) {
    return `${type}:${normalizeTitle(title)}`;
}

function getTitleMapping(): TitleMapping {
    return loadJson<TitleMapping>(MAPPING_KEY, {});
}

function setTitleMapping(mapping: TitleMapping) {
    saveJson(MAPPING_KEY, mapping);
}

async function resolveImdbId(
    title: string,
    type: "movie" | "series",
): Promise<string | null> {
    const mapping = getTitleMapping();
    const key = getMappingKey(type, title);
    if (mapping[key]) return mapping[key];

    const results = await searchTitles(title);
    if (!Array.isArray(results) || results.length === 0) return null;

    let best: any = null;
    let bestScore = -1;
    for (const r of results) {
        const candidateTitle = r?.["#TITLE"];
        const score = scoreTitleMatch(candidateTitle, title);
        if (score > bestScore) {
            bestScore = score;
            best = r;
        }
    }

    const imdbId = best?.["#IMDB_ID"];
    if (typeof imdbId !== "string" || !imdbId) return null;

    mapping[key] = imdbId;
    setTitleMapping(mapping);
    return imdbId;
}

export async function scanAndIndex(): Promise<{ entries: number } | null> {
    if (!isElectron()) return null;

    const roots = getRoots();
    if (roots.length === 0) {
        setIndex([]);
        return { entries: 0 };
    }

    const scanned: ScannedLocalFile[] = await (window as any).electronAPI.localLibrary.scan(
        roots,
    );

    const entries: LocalIndexEntry[] = [];

    for (const item of scanned || []) {
        const parsed = item?.parsed;
        const filePath = item?.path;
        if (!parsed || typeof filePath !== "string" || !filePath) continue;

        const type = parsed.kind === "episode" ? "series" : "movie";
        const imdbType = type === "series" ? "series" : "movie";

        const imdbId = await resolveImdbId(parsed.title, imdbType);
        if (!imdbId) continue;

        if (parsed.kind === "episode") {
            entries.push({
                imdbId,
                type,
                filePath,
                displayTitle: `${parsed.title} S${String(parsed.season).padStart(2, "0")}E${String(parsed.episode).padStart(2, "0")}`,
                season: parsed.season,
                episode: parsed.episode,
                addedAt: Date.now(),
            });
        } else {
            entries.push({
                imdbId,
                type,
                filePath,
                displayTitle: parsed.title,
                addedAt: Date.now(),
            });
        }
    }

    setIndex(entries);
    return { entries: entries.length };
}

export type LocalStream = {
    name: string;
    title: string;
    url?: string;
    raffiSource?: "local";
};

export function getLocalStreamsFor(
    imdbId: string,
    type: "movie" | "series",
    episode?: { season?: number; episode?: number } | null,
): LocalStream[] {
    const index = getIndex();
    const filtered = index.filter((e) => e.imdbId === imdbId);

    if (type === "series") {
        const s = Number(episode?.season ?? -1);
        const ep = Number(episode?.episode ?? -1);
        return filtered
            .filter((e) => e.type === "series" && e.season === s && e.episode === ep)
            .map((e) => ({
                name: "Local",
                title: e.displayTitle,
                url: e.filePath,
                raffiSource: "local",
            }));
    }

    return filtered
        .filter((e) => e.type === "movie")
        .map((e) => ({
            name: "Local",
            title: e.displayTitle,
            url: e.filePath,
            raffiSource: "local",
        }));
}
