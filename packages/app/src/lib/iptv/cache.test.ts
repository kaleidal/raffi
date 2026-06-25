import { beforeEach, describe, expect, test } from "bun:test";
import {
    clearStoredIptvRefreshResult,
    getStoredIptvRefreshResult,
    persistIptvRefreshResult,
} from "./cache";
import type { IptvRefreshResult, IptvSource } from "./types";

class MemoryStorage {
    private values = new Map<string, string>();

    getItem(key: string) {
        return this.values.get(key) ?? null;
    }

    setItem(key: string, value: string) {
        this.values.set(key, value);
    }

    removeItem(key: string) {
        this.values.delete(key);
    }

    clear() {
        this.values.clear();
    }
}

const source: IptvSource = {
    id: "source-1",
    kind: "m3u",
    name: "Dispatcharr",
    m3uUrl: "https://dispatcharr.example.test/output/m3u",
    epgUrl: "https://dispatcharr.example.test/output/epg",
    createdAt: "2026-06-22T10:00:00.000Z",
    updatedAt: "2026-06-22T10:00:00.000Z",
};

const result: IptvRefreshResult = {
    loadedAt: "2026-06-22T14:00:00.000Z",
    channels: [
        {
            id: "source-1:0:abc",
            sourceId: "source-1",
            name: "ABC",
            url: "https://dispatcharr.example.test/proxy/ts/stream/abc",
            group: "News",
            tvgId: "abc.us",
            tvgName: "ABC",
            logo: "https://dispatcharr.example.test/logo/abc.png",
            order: 0,
        },
    ],
    groups: [
        {
            id: "source-1:group:news",
            sourceId: "source-1",
            name: "News",
            channelCount: 1,
            order: 0,
        },
    ],
    guide: {
        channels: new Map(),
        programmesByChannel: new Map(),
        displayNameToChannelId: new Map(),
    },
    stats: {
        channelCount: 1,
        groupCount: 1,
        programmeCount: 42,
    },
};

const cacheKey = "raffi_iptv_refresh_result_v1:source-1";

describe("IPTV refresh result cache", () => {
    let storage: MemoryStorage;

    beforeEach(() => {
        storage = new MemoryStorage();
        Object.defineProperty(globalThis, "localStorage", {
            value: storage,
            configurable: true,
        });
    });

    test("hydrates cached channels and groups for the same source without persisting guide maps", () => {
        persistIptvRefreshResult(source, result);

        const cached = getStoredIptvRefreshResult(source);

        expect(cached?.channels.map((channel) => channel.name)).toEqual(["ABC"]);
        expect(cached?.groups.map((group) => group.name)).toEqual(["News"]);
        expect(cached?.loadedAt).toBe(result.loadedAt);
        expect(cached?.stats).toEqual({
            channelCount: 1,
            groupCount: 1,
            programmeCount: 42,
        });
        expect(cached?.guide).toBeUndefined();

        const rawStored = storage.getItem(cacheKey) ?? "";
        const stored = JSON.parse(rawStored) as Record<string, unknown>;
        expect(Object.hasOwn(stored, "guide")).toBe(false);
        expect(Object.hasOwn(stored, "programmesByChannel")).toBe(false);
    });

    test("ignores cached results with mismatched child source ids", () => {
        persistIptvRefreshResult(source, result);
        const stored = JSON.parse(storage.getItem(cacheKey) ?? "{}");

        storage.setItem(
            cacheKey,
            JSON.stringify({
                ...stored,
                channels: [{ ...stored.channels[0], sourceId: "other-source" }],
            }),
        );
        expect(getStoredIptvRefreshResult(source)).toBeNull();

        storage.setItem(
            cacheKey,
            JSON.stringify({
                ...stored,
                groups: [{ ...stored.groups[0], sourceId: "other-source" }],
            }),
        );
        expect(getStoredIptvRefreshResult(source)).toBeNull();
    });

    test("ignores cached results with invalid loaded timestamps", () => {
        persistIptvRefreshResult(source, result);
        const stored = JSON.parse(storage.getItem(cacheKey) ?? "{}");

        storage.setItem(
            cacheKey,
            JSON.stringify({
                ...stored,
                loadedAt: "not-a-date",
            }),
        );

        expect(getStoredIptvRefreshResult(source)).toBeNull();
    });

    test("ignores cached channels after the source URL changes", () => {
        persistIptvRefreshResult(source, result);

        expect(
            getStoredIptvRefreshResult({
                ...source,
                m3uUrl: "https://dispatcharr.example.test/output/m3u/clean",
            }),
        ).toBeNull();
    });

    test("can clear cached channels for removed sources", () => {
        persistIptvRefreshResult(source, result);
        clearStoredIptvRefreshResult(source.id);

        expect(getStoredIptvRefreshResult(source)).toBeNull();
    });

    test("does not cache Xtream channels because stream URLs can contain credentials", () => {
        const xtreamSource: IptvSource = {
            id: "xtream-1",
            kind: "xtream",
            name: "Xtream Live",
            serverUrl: "https://panel.example.test:8443/",
            username: "xtream-user",
            credential: "secret-pass",
            createdAt: "2026-06-22T10:00:00.000Z",
            updatedAt: "2026-06-22T10:00:00.000Z",
        };
        const xtreamCacheKey = "raffi_iptv_refresh_result_v1:xtream-1";
        const xtreamResult: IptvRefreshResult = {
            ...result,
            channels: result.channels.map((channel) => ({
                ...channel,
                id: channel.id.replace(source.id, xtreamSource.id),
                sourceId: xtreamSource.id,
                url: "https://panel.example.test:8443/live/xtream-user/secret-pass/1.ts",
            })),
            groups: result.groups.map((group) => ({
                ...group,
                id: group.id.replace(source.id, xtreamSource.id),
                sourceId: xtreamSource.id,
            })),
        };

        storage.setItem(xtreamCacheKey, "legacy cache containing secret-pass");
        persistIptvRefreshResult(xtreamSource, xtreamResult);

        expect(storage.getItem(xtreamCacheKey)).toBeNull();
        expect(getStoredIptvRefreshResult(xtreamSource)).toBeNull();

        storage.setItem(xtreamCacheKey, "legacy cache containing secret-pass");

        expect(getStoredIptvRefreshResult(xtreamSource)).toBeNull();
        expect(storage.getItem(xtreamCacheKey)).toBeNull();
    });
});
