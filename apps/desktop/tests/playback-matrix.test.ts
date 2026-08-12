import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildArguments } = require("../electron/services/ffmpegPlayback.cjs");
const desktopDir = join(import.meta.dir, "..");
const ffmpeg = join(desktopDir, "vendor", "ffmpeg", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
const electron = join(
	desktopDir,
	"node_modules",
	"electron",
	"dist",
	process.platform === "win32" ? "electron.exe" : "electron",
);
const localSource = join(import.meta.dir, "fixtures", "h264-aac-dts.mkv");
const outputDir = mkdtempSync(join(tmpdir(), "raffi-playback-matrix-"));

afterAll(() => rmSync(outputDir, { recursive: true, force: true }));

async function run(arguments_: string[]) {
	const child = Bun.spawn([ffmpeg, ...arguments_], { stdout: "pipe", stderr: "pipe" });
	const [exitCode, stderr] = await Promise.all([
		child.exited,
		new Response(child.stderr).text(),
	]);
	if (exitCode !== 0) throw new Error(stderr);
	return stderr;
}

async function describeOutput(output: string) {
	return run(["-hide_banner", "-i", output, "-map", "0", "-f", "null", "-"]);
}

function serveFixture(honorRanges = true) {
	const fixture = Bun.file(localSource);
	return Bun.serve({
		port: 0,
		async fetch(request) {
			const size = fixture.size;
			const range = request.headers.get("range")?.match(/^bytes=(\d+)-(\d*)$/);
			if (!range || !honorRanges) {
				return new Response(fixture, {
					headers: { "Accept-Ranges": "bytes", "Content-Length": String(size) },
				});
			}

			const start = Number(range[1]);
			const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
			return new Response(fixture.slice(start, end + 1), {
				status: 206,
				headers: {
					"Accept-Ranges": "bytes",
					"Content-Length": String(end - start + 1),
					"Content-Range": `bytes ${start}-${end}/${size}`,
				},
			});
		},
	});
}

describe("desktop playback compatibility matrix", () => {
	test("Chromium MSE accepts the emitted AAC and Opus MP4 codecs", async () => {
		const environment = { ...process.env };
		delete environment.ELECTRON_RUN_AS_NODE;
		const child = Bun.spawn([electron, "--headless", "--no-sandbox", join(import.meta.dir, "mse-harness.cjs")], {
			cwd: desktopDir,
			env: environment,
			stdout: "pipe",
			stderr: "pipe",
		});
		const [exitCode, stdout, stderr] = await Promise.all([
			child.exited,
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
		]);
		if (exitCode !== 0) throw new Error(stderr);
		const support = JSON.parse(stdout.trim().split("\n").at(-1)!);
		expect(support).toEqual({ aac: true, opus: true });
	}, 20_000);

	test("copies stereo AAC from an HTTP range source without needless transcoding", async () => {
		const server = serveFixture();
		try {
			const output = join(outputDir, "russian-aac.mp4");
			const args = buildArguments({
				source: `http://127.0.0.1:${server.port}/fixture.mkv`,
				startTime: 0,
				audioIndex: 0,
				audioChannels: 2,
				copyAudio: true,
				caFile: null,
			});
			expect(args).toContain("copy");
			expect(args).not.toContain("libopus");
			args[args.length - 1] = output;
			await run(["-y", ...args]);
			const description = await describeOutput(output);
			expect(description).toContain("Video: h264");
			expect(description).toMatch(/Audio: aac \(LC\).*48000 Hz, stereo/);
		} finally {
			server.stop(true);
		}
	});

	test("streams from an HTTP origin that ignores byte ranges", async () => {
		const server = serveFixture(false);
		try {
			const output = join(outputDir, "sequential-http.mp4");
			const args = buildArguments({
				source: `http://127.0.0.1:${server.port}/fixture.mkv`,
				startTime: 4,
				audioIndex: 1,
				audioChannels: 6,
				copyAudio: false,
				caFile: null,
				httpSeekable: false,
			});
			expect(args.slice(args.indexOf("-seekable"), args.indexOf("-seekable") + 2)).toEqual([
				"-seekable",
				"0",
			]);
			args[args.length - 1] = output;
			await run(["-y", ...args]);
			const description = await describeOutput(output);
			expect(description).toContain("Video: h264");
			expect(description).toContain("Audio: opus");
		} finally {
			server.stop(true);
		}
	});

	test("selects English DTS, preserves seek preroll, and emits browser-safe surround Opus", async () => {
		const output = join(outputDir, "english-dts.mp4");
		const args = buildArguments({ source: localSource, startTime: 4, audioIndex: 1, audioChannels: 6, copyAudio: false, caFile: null });
		expect(args).toContain("-noaccurate_seek");
		expect(args).toContain("aformat=channel_layouts=5.1");
		expect(args).toContain("1");
		args[args.length - 1] = output;
		await run(["-y", ...args]);
		const description = await describeOutput(output);
		expect(description).toContain("Video: h264");
		expect(description).toContain("Audio: opus");
		expect(description).toContain("5.1");
	});
});
