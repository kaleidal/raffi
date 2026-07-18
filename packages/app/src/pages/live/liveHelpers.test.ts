import { beforeEach, describe, expect, test } from "bun:test";
import {
    ALL_GROUPS,
    FAVORITES_GROUP,
    LIVE_TV_REFRESH_INTERVAL_MS,
    LIVE_TV_SELECTION_STORAGE_KEY,
    getStoredLiveTvFavoriteChannelIds,
    getStoredLiveTvGroup,
    getStoredLiveTvLastChannelId,
    getStoredLiveTvSelection,
    getVisibleChannels,
    getVisibleLiveTvGroups,
    isLiveTvRefreshDue,
    normalizeLiveTvGroup,
    setStoredLiveTvFavoriteChannelIds,
    setStoredLiveTvGroup,
    setStoredLiveTvLastChannelId,
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
            lastChannelIdsBySourceId: {},
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
            lastChannelIdsBySourceId: {},
        });
    });

    test("returns defaults when storage has invalid JSON", () => {
        storage.setItem(LIVE_TV_SELECTION_STORAGE_KEY, "{");

        expect(getStoredLiveTvSelection()).toEqual({
            sourceId: "",
            groupsBySourceId: {},
            favoritesBySourceId: {},
            lastChannelIdsBySourceId: {},
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

    test("persists the last played channel per source", () => {
        setStoredLiveTvLastChannelId(" source-1 ", " abc ");
        setStoredLiveTvLastChannelId("source-2", "espn");

        expect(getStoredLiveTvLastChannelId("source-1")).toBe("abc");
        expect(getStoredLiveTvLastChannelId("source-2")).toBe("espn");
        expect(getStoredLiveTvSelection().lastChannelIdsBySourceId).toEqual({
            "source-1": "abc",
            "source-2": "espn",
        });
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
                lastChannelIdsBySourceId: {
                    "source-1": " abc ",
                    empty: " ",
                    bad: 42,
                },
            }),
        );

        expect(getStoredLiveTvSelection()).toEqual({
            sourceId: "source-1",
            groupsBySourceId: {},
            favoritesBySourceId: {
                "source-1": ["abc", "bbc"],
            },
            lastChannelIdsBySourceId: {
                "source-1": "abc",
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

    test("falls back unknown persisted groups to all channels", () => {
        expect(getVisibleChannels(channels, "Removed Group", "", []).map((channel) => channel.id)).toEqual(["abc", "espn", "bbc"]);
    });
});

describe("Live TV group filtering", () => {
    const groups = [
        { id: "news", name: "News", channelCount: 12 },
        { id: "sports", name: "Sports", channelCount: 8 },
        { id: "kids", name: "Kids", channelCount: 4 },
    ];

    test("returns every group when the group search is empty", () => {
        expect(getVisibleLiveTvGroups(groups, "  ").map((group) => group.name)).toEqual([
            "News",
            "Sports",
            "Kids",
        ]);
    });

    test("filters groups case-insensitively by name", () => {
        expect(getVisibleLiveTvGroups(groups, "SP").map((group) => group.name)).toEqual([
            "Sports",
        ]);
    });

    test("normalizes removed persisted groups back to all groups", () => {
        expect(normalizeLiveTvGroup("Sports", groups)).toBe("Sports");
        expect(normalizeLiveTvGroup(FAVORITES_GROUP, groups)).toBe(FAVORITES_GROUP);
        expect(normalizeLiveTvGroup("Removed Group", groups)).toBe(ALL_GROUPS);
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
