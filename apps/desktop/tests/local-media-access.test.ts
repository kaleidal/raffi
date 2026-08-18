import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { createLocalMediaAccess } = require("../electron/services/localMediaAccess.cjs");
const { validateSource } = require("../electron/services/ffmpegPlayback.cjs");

const temporaryDirectories: string[] = [];

async function makeFixture() {
	const directory = await mkdtemp(join(tmpdir(), "raffi-media-access-"));
	temporaryDirectories.push(directory);
	const library = join(directory, "library");
	const outside = join(directory, "outside");
	await Promise.all([mkdir(library), mkdir(outside)]);
	const libraryFile = join(library, "episode.mkv");
	const outsideFile = join(outside, "private.txt");
	await Promise.all([writeFile(libraryFile, "media"), writeFile(outsideFile, "private")]);
	return { directory, library, libraryFile, outsideFile };
}

afterEach(async () => {
	await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("local media capabilities", () => {
	test("resolves an issued capability without exposing its filesystem path", async () => {
		const { libraryFile } = await makeFixture();
		const access = createLocalMediaAccess();
		const url = await access.authorizeTrustedFile(libraryFile);

		expect(url).toMatch(/^raffi-media:\/\/local\/[0-9a-f-]+$/);
		expect(url).not.toContain(encodeURIComponent(libraryFile));
		expect(access.resolveRequestUrl(url)).toBe(libraryFile);
	});

	test("rejects raw paths and unknown capabilities", async () => {
		const { outsideFile } = await makeFixture();
		const access = createLocalMediaAccess();

		expect(access.resolveRequestUrl(`raffi-media://local/?path=${encodeURIComponent(outsideFile)}`)).toBeNull();
		expect(access.resolveRequestUrl(`raffi-media://local/${encodeURIComponent(outsideFile)}`)).toBeNull();
		expect(access.resolveRequestUrl("raffi-media://local/00000000-0000-0000-0000-000000000000")).toBeNull();
	});

	test("only authorizes library files below a picker-approved root", async () => {
		const { directory, library, libraryFile, outsideFile } = await makeFixture();
		const access = createLocalMediaAccess();
		await access.loadRoots(join(directory, "roots.json"));
		await access.approveLibraryRoot(library);

		await expect(access.authorizeLibraryFile(outsideFile)).rejects.toThrow("outside the approved local library");
		const url = await access.authorizeLibraryFile(libraryFile);
		expect(access.resolveRequestUrl(url)).toBe(libraryFile);
	});

	test("prevents FFmpeg from bypassing the local media capability boundary", async () => {
		const { outsideFile } = await makeFixture();
		const access = createLocalMediaAccess();

		expect(() => validateSource(outsideFile, access)).toThrow("authorized local media");
		const url = await access.authorizeTrustedFile(outsideFile);
		expect(validateSource(url, access)).toBe(outsideFile);
	});
});
