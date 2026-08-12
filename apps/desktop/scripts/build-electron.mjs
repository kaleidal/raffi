import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(desktopDir, "electron-dist");

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

for (const entry of ["main", "preload"]) {
	const result = await Bun.build({
		entrypoints: [path.join(desktopDir, "electron", `${entry}.cjs`)],
		external: ["electron"],
		format: "cjs",
		minify: true,
		naming: "[name].cjs",
		outdir: outputDir,
		target: "node",
	});
	if (!result.success) {
		throw new AggregateError(result.logs, `Could not bundle Electron ${entry}`);
	}
}
