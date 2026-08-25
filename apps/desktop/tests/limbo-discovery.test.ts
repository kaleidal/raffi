import { describe, expect, test } from "bun:test";
import path from "node:path";

const { candidateLimboApiPaths } = require("../electron/services/limboDiscovery.cjs");

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

	test("checks the host data directory from a Flatpak sandbox", () => {
		expect(
			candidateLimboApiPaths({
				platform: "linux",
				env: {
					XDG_DATA_HOME: "/home/raffi/.var/app/al.kaleid.raffi/data",
					HOST_XDG_DATA_HOME: "/home/raffi/.local/share",
				},
				home: "/home/raffi",
			}),
		).toEqual([
			"/home/raffi/.var/app/al.kaleid.raffi/data/limbo/api.json",
			"/home/raffi/.local/share/limbo/api.json",
		]);
	});
});
