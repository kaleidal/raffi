import { writable } from "svelte/store";
import type { IptvSource, IptvSourceKind } from "./types";
import { validateIptvUrl } from "./fetch";
import { clearStoredIptvRefreshResult } from "./cache";
import { normalizeXtreamServerUrl, requireXtreamField } from "./xtream";

export const IPTV_SOURCES_STORAGE_KEY = "raffi_iptv_sources_v1";

type M3uSourceInput = {
    kind?: "m3u";
    name: string;
    m3uUrl: string;
    epgUrl?: string | null;
};

type XtreamSourceInput = {
    kind: "xtream";
    name: string;
    serverUrl: string;
    username: string;
    credential: string;
};

type SourceInput = M3uSourceInput | XtreamSourceInput;

type SourceUpdateInput = Partial<{
    kind: IptvSourceKind;
    name: string;
    m3uUrl: string;
    epgUrl: string | null;
    serverUrl: string;
    username: string;
    credential: string;
}>;

function createId(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID();
    }
    return `iptv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getStorage(): Storage | null {
    try {
        return typeof localStorage !== "undefined" ? localStorage : null;
    } catch {
        return null;
    }
}

function readXtreamCredential(value: Record<string, unknown>): string {
    if (typeof value.credential === "string") return value.credential;
    const legacyCredential = value["password"];
    return typeof legacyCredential === "string" ? legacyCredential : "";
}

function sanitizeSource(value: any): IptvSource | null {
    if (!value || typeof value !== "object") return null;
    if (typeof value.id !== "string" || !value.id.trim()) return null;
    if (typeof value.name !== "string" || !value.name.trim()) return null;
    if (value.kind !== "m3u" && value.kind !== "xtream") return null;

    try {
        const now = new Date().toISOString();
        const baseSource = {
            id: value.id.trim(),
            name: value.name.trim(),
            createdAt: typeof value.createdAt === "string" ? value.createdAt : now,
            updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : now,
        };

        if (value.kind === "xtream") {
            return {
                ...baseSource,
                kind: "xtream",
                serverUrl: normalizeXtreamServerUrl(value.serverUrl),
                username: requireXtreamField(value.username, "username"),
                credential: requireXtreamField(readXtreamCredential(value), "password"),
            };
        }

        if (typeof value.m3uUrl !== "string" || !value.m3uUrl.trim()) return null;
        const m3uUrl = validateIptvUrl(value.m3uUrl);
        const epgUrl =
            typeof value.epgUrl === "string" && value.epgUrl.trim()
                ? validateIptvUrl(value.epgUrl)
                : undefined;

        return {
            ...baseSource,
            kind: "m3u",
            m3uUrl,
            epgUrl,
        };
    } catch {
        return null;
    }
}

function persistSources(sources: IptvSource[]) {
    const storage = getStorage();
    if (!storage) return;
    storage.setItem(IPTV_SOURCES_STORAGE_KEY, JSON.stringify(sources));
}

function setSources(sources: IptvSource[]) {
    persistSources(sources);
    iptvSources.set(sources);
}

export function getStoredIptvSources(): IptvSource[] {
    const storage = getStorage();
    if (!storage) return [];

    try {
        const raw = storage.getItem(IPTV_SOURCES_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.map(sanitizeSource).filter(Boolean) as IptvSource[];
    } catch {
        return [];
    }
}

function normalizeSourceInput(input: SourceInput | SourceUpdateInput, existing?: IptvSource) {
    const fields = input as SourceUpdateInput;
    const name = String(fields.name ?? existing?.name ?? "").trim();
    if (!name) {
        throw new Error("Enter a source name");
    }

    const kind = fields.kind ?? existing?.kind ?? "m3u";
    if (kind === "xtream") {
        const existingXtream = existing?.kind === "xtream" ? existing : null;
        const serverUrl = normalizeXtreamServerUrl(
            fields.serverUrl ?? existingXtream?.serverUrl ?? "",
        );
        const username = requireXtreamField(
            fields.username ?? existingXtream?.username ?? "",
            "username",
        );
        const credential = requireXtreamField(
            fields.credential ?? existingXtream?.credential ?? "",
            "password",
        );

        return {
            kind,
            name,
            serverUrl,
            username,
            credential,
        };
    }

    const existingM3u = existing?.kind === "m3u" ? existing : null;
    const m3uUrl = validateIptvUrl(fields.m3uUrl ?? existingM3u?.m3uUrl ?? "");
    const epgInput = fields.epgUrl === undefined ? existingM3u?.epgUrl : fields.epgUrl;
    const epgUrl =
        typeof epgInput === "string" && epgInput.trim()
            ? validateIptvUrl(epgInput)
            : undefined;

    return {
        kind,
        name,
        m3uUrl,
        epgUrl,
    };
}

export const iptvSources = writable<IptvSource[]>(getStoredIptvSources());

export function addIptvSource(input: SourceInput): IptvSource {
    const normalized = normalizeSourceInput(input);
    const now = new Date().toISOString();
    const source: IptvSource =
        normalized.kind === "xtream"
            ? {
                  id: createId(),
                  kind: "xtream",
                  name: normalized.name,
                  serverUrl: normalized.serverUrl,
                  username: normalized.username,
                  credential: normalized.credential,
                  createdAt: now,
                  updatedAt: now,
              }
            : {
                  id: createId(),
                  kind: "m3u",
                  name: normalized.name,
                  m3uUrl: normalized.m3uUrl,
                  epgUrl: normalized.epgUrl,
                  createdAt: now,
                  updatedAt: now,
              };

    setSources([...getStoredIptvSources(), source]);
    return source;
}

export function updateIptvSource(
    sourceId: string,
    input: SourceUpdateInput,
): IptvSource | null {
    const sources = getStoredIptvSources();
    const existing = sources.find((source) => source.id === sourceId);
    if (!existing) return null;

    const normalized = normalizeSourceInput(input, existing);

    const updated: IptvSource =
        normalized.kind === "xtream"
            ? {
                  id: existing.id,
                  kind: "xtream",
                  name: normalized.name,
                  serverUrl: normalized.serverUrl,
                  username: normalized.username,
                  credential: normalized.credential,
                  createdAt: existing.createdAt,
                  updatedAt: new Date().toISOString(),
              }
            : {
                  id: existing.id,
                  kind: "m3u",
                  name: normalized.name,
                  m3uUrl: normalized.m3uUrl,
                  epgUrl: normalized.epgUrl,
                  createdAt: existing.createdAt,
                  updatedAt: new Date().toISOString(),
              };

    setSources(sources.map((source) => (source.id === sourceId ? updated : source)));
    return updated;
}

export function removeIptvSource(sourceId: string): void {
    setSources(getStoredIptvSources().filter((source) => source.id !== sourceId));
    clearStoredIptvRefreshResult(sourceId);
}
