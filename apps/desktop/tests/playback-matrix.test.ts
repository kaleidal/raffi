import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

const require = createRequire(import.meta.url);
const {
	buildArguments,
	createFfmpegPlaybackService,
} = require("../electron/services/ffmpegPlayback.cjs");
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
const trueHdSource = join(import.meta.dir, "fixtures", "h264-truehd.mkv");
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
	const child = Bun.spawn([ffmpeg, "-hide_banner", "-i", output], {
		stdout: "ignore",
		stderr: "pipe",
	});
	const [, stderr] = await Promise.all([
		child.exited,
		new Response(child.stderr).text(),
	]);
	return stderr;
}

function serveFixture(source = localSource, honorRanges = true) {
	const fixture = Bun.file(source);
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
	test("waits for FFmpeg streams to close before releasing a playback session", async () => {
		const handlers = new Map<string, (...args: any[]) => any>();
		const child = Object.assign(new EventEmitter(), {
			stdout: new PassThrough(),
			stderr: new PassThrough(),
			exitCode: null as number | null,
			killSignals: [] as string[],
			kill(signal: string) {
				this.killSignals.push(signal);
				return true;
			},
		});
		createFfmpegPlaybackService({
			app: { isPackaged: false },
			protocol: { handle() {} },
			ipcMain: {
				handle(name: string, handler: (...args: any[]) => any) {
					handlers.set(name, handler);
				},
			},
			spawn: () => child,
			baseDir: join(desktopDir, "electron"),
			resourcesPath: "",
		});

		const startPromise = handlers.get("FFMPEG_PLAYBACK_START")!({}, {
			source: localSource,
			startTime: 0,
			audioIndex: 1,
			audioChannels: 6,
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
		child.stdout.write(Buffer.from("mp4"));
		const started = await startPromise;
		let stopped = false;
		const stopPromise = handlers.get("FFMPEG_PLAYBACK_STOP")!({}, started.sessionId)
			.then(() => {
				stopped = true;
			});
		await Promise.resolve();
		expect(stopped).toBe(false);
		expect(child.killSignals).toEqual(["SIGTERM"]);
		child.exitCode = 0;
		child.emit("exit", 0, null);
		await Promise.resolve();
		expect(stopped).toBe(false);
		child.emit("close", 0, null);
		await stopPromise;
		expect(stopped).toBe(true);
	});

	test("stops FFmpeg playback when its stdout stream fails", async () => {
		const handlers = new Map<string, (...args: any[]) => any>();
		const child = Object.assign(new EventEmitter(), {
			stdout: new PassThrough(),
			stderr: new PassThrough(),
			exitCode: null as number | null,
			killSignals: [] as string[],
			kill(signal: string) {
				this.killSignals.push(signal);
				return true;
			},
		});
		createFfmpegPlaybackService({
			app: { isPackaged: false },
			protocol: { handle() {} },
			ipcMain: {
				handle(name: string, handler: (...args: any[]) => any) {
					handlers.set(name, handler);
				},
			},
			spawn: () => child,
			baseDir: join(desktopDir, "electron"),
			resourcesPath: "",
		});

		const startPromise = handlers.get("FFMPEG_PLAYBACK_START")!({}, {
			source: localSource,
			startTime: 0,
			audioIndex: 1,
			audioChannels: 6,
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
		child.stdout.write(Buffer.from("mp4"));
		await startPromise;
		child.stdout.emit("error", new Error("stdout failed"));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(child.killSignals).toEqual(["SIGTERM"]);
		child.exitCode = 1;
		child.emit("exit", 1, null);
		child.emit("close", 1, null);
	});

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

	test("streams from an HTTP origin that ignores byte ranges", async () => {
		const server = serveFixture(trueHdSource, false);
		try {
			const output = join(outputDir, "sequential-http.mp4");
			const args = buildArguments({
				source: `http://127.0.0.1:${server.port}/fixture.mkv`,
				startTime: 1,
				audioIndex: 0,
				audioChannels: 6,
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

	test("converts TrueHD while preserving seek preroll and copying H.264 video", async () => {
		const output = join(outputDir, "truehd-opus.mp4");
		const args = buildArguments({ source: trueHdSource, startTime: 1, audioIndex: 0, audioChannels: 6, caFile: null });
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
