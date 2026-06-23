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
        expect(JSON.stringify(storage)).not.toContain("programmesByChannel");
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
});
