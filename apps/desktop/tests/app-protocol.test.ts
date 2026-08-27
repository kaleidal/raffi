import { describe, expect, test } from "bun:test";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { appPrivilegedScheme, resolveAppAssetPath } = require("../electron/services/appProtocol.cjs");

describe("packaged app protocol", () => {
	test("permits WebAssembly compilation without enabling JavaScript eval", async () => {
		const html = await Bun.file(join(import.meta.dir, "..", "index.html")).text();
		const scriptSources = html
			.match(/script-src\s+([^;]+)/)?.[1]
			.trim()
			.split(/\s+/) ?? [];

		expect(scriptSources).toContain("'wasm-unsafe-eval'");
		expect(scriptSources).not.toContain("'unsafe-eval'");
	});

	test("supports cross-origin API requests", () => {
		expect(appPrivilegedScheme.privileges).toMatchObject({
			standard: true,
			secure: true,
			supportFetchAPI: true,
			corsEnabled: true,
		});
	});

	test("serves only assets below the packaged renderer directory", () => {
		const distPath = join(import.meta.dir, "..", "dist");
		expect(resolveAppAssetPath(distPath, "raffi-app://app/")).toBe(join(distPath, "index.html"));
		expect(resolveAppAssetPath(distPath, "raffi-app://app/assets/app.js")).toBe(join(distPath, "assets", "app.js"));
		expect(resolveAppAssetPath(distPath, "raffi-app://other/index.html")).toBeNull();
		expect(resolveAppAssetPath(distPath, "raffi-app://app/%2e%2e%2Fpackage.json")).toBeNull();
	});
});
