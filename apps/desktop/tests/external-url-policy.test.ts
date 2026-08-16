import { describe, expect, test } from "bun:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { isAllowedExternalUrl } = require("../electron/services/protocol.cjs") as {
    isAllowedExternalUrl: (value: string) => boolean;
};

describe("desktop external URL policy", () => {
    test("allows supported debrid dashboards", () => {
        const dashboards = [
            "https://www.torbox.app/dashboard",
            "https://real-debrid.com/torrents",
            "https://alldebrid.com/magnets/",
            "https://www.premiumize.me/transfers",
        ];

        for (const dashboard of dashboards) {
            expect(isAllowedExternalUrl(dashboard)).toBe(true);
        }
    });

    test("still rejects insecure and unrelated URLs", () => {
        expect(isAllowedExternalUrl("http://www.torbox.app/dashboard")).toBe(false);
        expect(isAllowedExternalUrl("https://example.com/dashboard")).toBe(false);
    });
});
