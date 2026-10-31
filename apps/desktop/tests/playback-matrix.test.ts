import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const electron = require("electron") as string;
const desktopDir = join(import.meta.dir, "..");
const fixturesDir = join(import.meta.dir, "fixtures");
const bundleDir = mkdtempSync(join(tmpdir(), "raffi-decode-page-"));

afterAll(() => rmSync(bundleDir, { recursive: true, force: true }));

async function evaluateInChromium(expression: string, url = "data:text/html,<meta charset=utf-8>") {
	const environment = { ...process.env };
	delete environment.ELECTRON_RUN_AS_NODE;
	const child = Bun.spawn(
		[electron, "--headless", "--no-sandbox", join(import.meta.dir, "chromium-harness.cjs"), url, expression],
		{ cwd: desktopDir, env: environment, stdout: "pipe", stderr: "pipe" },
	);
	const [exitCode, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	if (exitCode !== 0) throw new Error(stderr);
	return JSON.parse(stdout.trim().split("\n").at(-1)!);
}

function serveRange(file: ReturnType<typeof Bun.file>, rangeHeader: string | null) {
	const range = rangeHeader?.match(/^bytes=(\d+)-(\d*)$/);
	if (!range) return new Response(file, { headers: { "Accept-Ranges": "bytes" } });
	const start = Number(range[1]);
	const end = range[2] ? Math.min(Number(range[2]), file.size - 1) : file.size - 1;
	return new Response(file.slice(start, end + 1), {
		status: 206,
		headers: {
			"Accept-Ranges": "bytes",
			"Content-Length": String(end - start + 1),
			"Content-Range": `bytes ${start}-${end}/${file.size}`,
		},
	});
}

async function serveDecodePage() {
	const build = await Bun.build({
		entrypoints: [join(import.meta.dir, "decode-page.ts")],
		outdir: bundleDir,
		target: "browser",
	});
	if (!build.success) throw new AggregateError(build.logs, "Could not bundle the decode page");
	return Bun.serve({
		port: 0,
		fetch(request) {
			const { pathname } = new URL(request.url);
			if (pathname === "/") {
				return new Response('<meta charset="utf-8"><script type="module" src="/decode-page.js"></script>', {
					headers: { "Content-Type": "text/html" },
				});
			}
			if (pathname.startsWith("/fixtures/")) {
				return serveRange(Bun.file(join(fixturesDir, pathname.slice("/fixtures/".length))), request.headers.get("range"));
			}
			return new Response(Bun.file(join(bundleDir, pathname.slice(1))));
		},
	});
}

describe("desktop playback", () => {
	test("Chromium MSE accepts the AAC MP4 that remuxing emits", async () => {
		const supported = await evaluateInChromium(
			`MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E, mp4a.40.2"')`,
		);
		expect(supported).toBe(true);
	}, 20_000);

	test("MediaBunny decodes DTS and TrueHD audio in Chromium", async () => {
		const server = await serveDecodePage();
		try {
			const tracks = await evaluateInChromium(
				`decodeFixtures(["h264-aac-dts.mkv", "h264-truehd.mkv"])`,
				`http://127.0.0.1:${server.port}/`,
			);
			expect(tracks).toEqual([
				{ fixture: "h264-aac-dts.mkv", codec: "aac", channels: 2, decoded: true },
				{ fixture: "h264-aac-dts.mkv", codec: "dts", channels: 6, decoded: true },
				{ fixture: "h264-truehd.mkv", codec: "truehd", channels: 6, decoded: true },
			]);
		} finally {
			server.stop(true);
		}
	}, 60_000);
});
