import { beforeEach, describe, expect, test } from "bun:test";
import {
    getStoredHomeLiveTvShortcutEnabled,
    setStoredHomeLiveTvShortcutEnabled,
} from "./searchBarSettings";

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
}

describe("home search bar settings", () => {
    let storage: MemoryStorage;

    beforeEach(() => {
        storage = new MemoryStorage();
        Object.defineProperty(globalThis, "window", {
            value: globalThis,
            configurable: true,
        });
        Object.defineProperty(globalThis, "localStorage", {
            value: storage,
            configurable: true,
        });
    });

    test("defaults the Live TV shortcut off", () => {
        expect(getStoredHomeLiveTvShortcutEnabled()).toBe(false);
    });

    test("persists the Live TV shortcut preference", () => {
        setStoredHomeLiveTvShortcutEnabled(true);
        expect(getStoredHomeLiveTvShortcutEnabled()).toBe(true);

        setStoredHomeLiveTvShortcutEnabled(false);
        expect(getStoredHomeLiveTvShortcutEnabled()).toBe(false);
    });
});
