import { beforeEach, describe, expect, test } from "bun:test";
import {
    FAVORITES_GROUP,
    LIVE_TV_REFRESH_INTERVAL_MS,
    LIVE_TV_SELECTION_STORAGE_KEY,
    getStoredLiveTvFavoriteChannelIds,
    getStoredLiveTvGroup,
    getStoredLiveTvSelection,
    getVisibleChannels,
    isLiveTvRefreshDue,
    setStoredLiveTvFavoriteChannelIds,
    setStoredLiveTvGroup,
    setStoredLiveTvSourceId,
    shouldAutoRefreshLiveTvSource,
    toggleStoredLiveTvFavoriteChannelId,
} from "./liveHelpers";

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

describe("Live TV selection persistence", () => {
    let storage: MemoryStorage;

    beforeEach(() => {
        storage = new MemoryStorage();
        Object.defineProperty(globalThis, "localStorage", {
            value: storage,
            configurable: true,
        });
    });

    test("persists the selected source and groups per source", () => {
        setStoredLiveTvSourceId(" source-1 ");
        setStoredLiveTvGroup("source-1", " News ");
        setStoredLiveTvGroup("source-2", "Sports");

        expect(getStoredLiveTvSelection()).toEqual({
            sourceId: "source-1",
            groupsBySourceId: {
                "source-1": "News",
                "source-2": "Sports",
            },
            favoritesBySourceId: {},
        });
        expect(getStoredLiveTvGroup("source-1")).toBe("News");
    });

    test("drops malformed persisted values", () => {
        storage.setItem(
            LIVE_TV_SELECTION_STORAGE_KEY,
            JSON.stringify({
                sourceId: 42,
                groupsBySourceId: {
                    good: "Documentaries",
                    empty: " ",
                    bad: null,
                },
            }),
        );

        expect(getStoredLiveTvSelection()).toEqual({
            sourceId: "",
            groupsBySourceId: {
                good: "Documentaries",
            },
            favoritesBySourceId: {},
        });
    });

    test("returns defaults when storage has invalid JSON", () => {
        storage.setItem(LIVE_TV_SELECTION_STORAGE_KEY, "{");

        expect(getStoredLiveTvSelection()).toEqual({
            sourceId: "",
            groupsBySourceId: {},
            favoritesBySourceId: {},
        });
    });

    test("persists favorite channel ids per source and toggles membership", () => {
        setStoredLiveTvFavoriteChannelIds(" source-1 ", [
            " abc ",
            "abc",
            " ",
            "bbc",
        ]);

        expect(getStoredLiveTvFavoriteChannelIds("source-1")).toEqual(["abc", "bbc"]);
        expect(toggleStoredLiveTvFavoriteChannelId("source-1", " bbc ")).toEqual(["abc"]);
        expect(toggleStoredLiveTvFavoriteChannelId("source-1", "cnn")).toEqual(["abc", "cnn"]);
        expect(getStoredLiveTvFavoriteChannelIds("source-1")).toEqual(["abc", "cnn"]);
        expect(getStoredLiveTvFavoriteChannelIds("source-2")).toEqual([]);
    });

    test("drops malformed persisted favorite channel ids", () => {
        storage.setItem(
            LIVE_TV_SELECTION_STORAGE_KEY,
            JSON.stringify({
                sourceId: "source-1",
                groupsBySourceId: {},
                favoritesBySourceId: {
                    "source-1": ["abc", " ", 42, "bbc", "abc"],
                    empty: [],
                    bad: "not-an-array",
                },
            }),
        );

        expect(getStoredLiveTvSelection()).toEqual({
            sourceId: "source-1",
            groupsBySourceId: {},
            favoritesBySourceId: {
                "source-1": ["abc", "bbc"],
            },
        });
    });
});

describe("Live TV visible channel filtering", () => {
    const channels = [
        {
            id: "abc",
            sourceId: "source-1",
            name: "ABC News",
            url: "https://example.test/abc.m3u8",
            group: "News",
            order: 0,
        },
        {
            id: "espn",
            sourceId: "source-1",
            name: "ESPN",
            url: "https://example.test/espn.m3u8",
            group: "Sports",
            order: 1,
        },
        {
            id: "bbc",
            sourceId: "source-1",
            name: "BBC World",
            url: "https://example.test/bbc.m3u8",
            group: "News",
            order: 2,
        },
    ];

    test("filters the virtual Favorites group by persisted favorite ids", () => {
        expect(getVisibleChannels(channels, FAVORITES_GROUP, "", ["espn", "missing", "abc"]).map((channel) => channel.id)).toEqual(["abc", "espn"]);
    });

    test("applies search inside the virtual Favorites group", () => {
        expect(getVisibleChannels(channels, FAVORITES_GROUP, "news", ["espn", "abc"]).map((channel) => channel.id)).toEqual(["abc"]);
    });
});

describe("Live TV refresh schedule", () => {
    const now = new Date("2026-06-22T20:00:00.000Z");

    test("treats missing or invalid cache timestamps as due", () => {
        expect(isLiveTvRefreshDue(null, now)).toBe(true);
        expect(isLiveTvRefreshDue("not-a-date", now)).toBe(true);
    });

    test("keeps fresh guide data until the scheduled interval elapses", () => {
        const freshLoadedAt = new Date(now.getTime() - LIVE_TV_REFRESH_INTERVAL_MS + 1).toISOString();
        const staleLoadedAt = new Date(now.getTime() - LIVE_TV_REFRESH_INTERVAL_MS - 1).toISOString();

        expect(isLiveTvRefreshDue(freshLoadedAt, now)).toBe(false);
        expect(isLiveTvRefreshDue(staleLoadedAt, now)).toBe(true);
    });

    test("refreshes old caches that have channel data but no persisted guide", () => {
        const source = {
            id: "source-1",
            kind: "m3u" as const,
            name: "Dispatcharr",
            m3uUrl: "https://dispatcharr.example.test/output/m3u",
            epgUrl: "https://dispatcharr.example.test/output/epg",
            createdAt: "2026-06-22T10:00:00.000Z",
            updatedAt: "2026-06-22T10:00:00.000Z",
        };
        const freshCacheWithoutGuide = {
            loadedAt: now.toISOString(),
            channels: [],
            groups: [],
            stats: {
                channelCount: 1,
                groupCount: 1,
                programmeCount: 12,
            },
        };

        expect(shouldAutoRefreshLiveTvSource(source, freshCacheWithoutGuide, now)).toBe(true);
    });
});
