import { beforeEach, describe, expect, test } from "bun:test";
import {
    addIptvSource,
    getStoredIptvSources,
    removeIptvSource,
    updateIptvSource,
} from "./store";

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

describe("IPTV source store helpers", () => {
    let storage: MemoryStorage;

    beforeEach(() => {
        storage = new MemoryStorage();
        Object.defineProperty(globalThis, "localStorage", {
            value: storage,
            configurable: true,
        });
    });

    test("adds, updates, and removes source config without fetched bodies", () => {
        const source = addIptvSource({
            name: "Live",
            m3uUrl: "https://iptv.example.test/playlist.m3u",
            epgUrl: "https://iptv.example.test/guide.xml",
        });

        expect(source.id).toBeTruthy();
        expect(getStoredIptvSources()).toHaveLength(1);

        const updated = updateIptvSource(source.id, {
            name: "Live TV",
            epgUrl: "",
        });

        expect(updated?.name).toBe("Live TV");
        expect(updated?.epgUrl).toBeUndefined();

        const rawStored = storage.getItem("raffi_iptv_sources_v1") ?? "";
        expect(rawStored).not.toContain("#EXTM3U");
        expect(rawStored).not.toContain("<programme");

        removeIptvSource(source.id);

        expect(getStoredIptvSources()).toEqual([]);
    });

    test("rejects non-http playlist and guide URLs", () => {
        expect(() =>
            addIptvSource({
                name: "Bad",
                m3uUrl: "file:///tmp/playlist.m3u",
            }),
        ).toThrow("Only http and https IPTV URLs are supported");

        expect(() =>
            addIptvSource({
                name: "Bad EPG",
                m3uUrl: "https://iptv.example.test/playlist.m3u",
                epgUrl: "ftp://iptv.example.test/guide.xml",
            }),
        ).toThrow("Only http and https IPTV URLs are supported");
    });

    test("adds and updates Xtream credentials sources", () => {
        const source = addIptvSource({
            kind: "xtream",
            name: "Xtream Live",
            serverUrl: "https://panel.example.test:8443/",
            username: "user@example",
            credential: "secret-pass",
        });

        expect(source).toMatchObject({
            kind: "xtream",
            name: "Xtream Live",
            serverUrl: "https://panel.example.test:8443",
            username: "user@example",
            credential: "secret-pass",
        });
        expect(getStoredIptvSources()).toHaveLength(1);

        const updated = updateIptvSource(source.id, {
            kind: "xtream",
            name: "Xtream Live HD",
            serverUrl: "https://panel.example.test:8443/base/",
            username: "user@example",
            credential: "rotated-secret",
        });

        expect(updated).toMatchObject({
            kind: "xtream",
            name: "Xtream Live HD",
            serverUrl: "https://panel.example.test:8443/base",
            credential: "rotated-secret",
        });
    });

    test("reads legacy Xtream sources stored with the old credential key", () => {
        const legacyCredentialKey = "password";
        storage.setItem(
            "raffi_iptv_sources_v1",
            JSON.stringify([
                {
                    id: "xtream-legacy",
                    kind: "xtream",
                    name: "Legacy Xtream",
                    serverUrl: "https://panel.example.test:8443/",
                    username: "user@example",
                    [legacyCredentialKey]: "legacy-secret",
                    createdAt: "2026-06-22T10:00:00.000Z",
                    updatedAt: "2026-06-22T10:00:00.000Z",
                },
            ]),
        );

        expect(getStoredIptvSources()).toEqual([
            {
                id: "xtream-legacy",
                kind: "xtream",
                name: "Legacy Xtream",
                serverUrl: "https://panel.example.test:8443",
                username: "user@example",
                credential: "legacy-secret",
                createdAt: "2026-06-22T10:00:00.000Z",
                updatedAt: "2026-06-22T10:00:00.000Z",
            },
        ]);
    });

    test("rejects non-http Xtream server URLs", () => {
        expect(() =>
            addIptvSource({
                kind: "xtream",
                name: "Bad Xtream",
                serverUrl: "ftp://panel.example.test",
                username: "user",
                credential: "pass",
            }),
        ).toThrow("Only http and https Xtream server URLs are supported");
    });
});
