import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(path.join(desktopDir, "ffmpeg.json"), "utf8"));
const platformKey = `${process.platform}-${process.arch}`;
const targetKey = platformKey === "darwin-x64" || platformKey === "darwin-arm64"
  ? "darwin-universal"
  : platformKey;
const target = manifest.targets[targetKey];
if (!target) throw new Error(`No bundled FFmpeg build for ${platformKey}`);

const vendorDir = path.join(desktopDir, "vendor", "ffmpeg");
const executableName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
const executablePath = path.join(vendorDir, executableName);
const receiptPath = path.join(vendorDir, ".receipt.json");

try {
  const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
  if (receipt.archiveSha256 === target.sha256 && receipt.tag === manifest.tag) {
    await chmod(executablePath, 0o755);
    process.exit(0);
  }
} catch {}

const tempDir = await mkdtemp(path.join(tmpdir(), "raffi-ffmpeg-"));
try {
  const archivePath = path.join(tempDir, target.asset);
  const response = await fetch(
    `https://github.com/${manifest.repository}/releases/download/${manifest.tag}/${target.asset}`,
  );
  if (!response.ok) throw new Error(`FFmpeg download failed with ${response.status}`);
  const archive = Buffer.from(await response.arrayBuffer());
  const digest = createHash("sha256").update(archive).digest("hex");
  if (digest !== target.sha256) {
    throw new Error(`FFmpeg checksum mismatch: expected ${target.sha256}, received ${digest}`);
  }
  await writeFile(archivePath, archive);
  const extractedDir = path.join(tempDir, "extracted");
  await mkdir(extractedDir);
  const extraction = spawnSync("tar", ["-xf", archivePath, "-C", extractedDir], {
    stdio: "inherit",
    windowsHide: true,
  });
  if (extraction.status !== 0) throw new Error("Could not extract the FFmpeg archive");

  await rm(vendorDir, { recursive: true, force: true });
  await mkdir(vendorDir, { recursive: true });
  await copyFile(path.join(extractedDir, executableName), executablePath);
  await chmod(executablePath, 0o755);
  for (const name of target.metadata) {
    await copyFile(path.join(extractedDir, name), path.join(vendorDir, name));
  }
  await writeFile(
    receiptPath,
    `${JSON.stringify({ repository: manifest.repository, tag: manifest.tag, asset: target.asset, archiveSha256: target.sha256 }, null, 2)}\n`,
  );
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
