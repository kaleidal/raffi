import { describe, expect, test } from "bun:test";
import path from "node:path";

const { candidateLimboApiPaths } = require("../electron/services/integrations/limboDiscovery.cjs");

describe("Limbo API discovery", () => {
	test("uses the canonical Windows ProjectDirs data path", () => {
		const appData = String.raw`C:\Users\Raffi\AppData\Roaming`;
		expect(
			candidateLimboApiPaths({
				platform: "win32",
				env: { APPDATA: appData },
				home: String.raw`C:\Users\Raffi`,
			}),
		).toEqual([path.win32.join(appData, "kaleid", "Limbo", "data", "api.json")]);
	});
});
