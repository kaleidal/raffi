const path = require("path");
const fs = require("fs");

const LOCAL_MEDIA_EXTS = new Set([
  ".mp4",
  ".mkv",
  ".webm",
  ".avi",
  ".mov",
  ".m4v",
]);

function cleanTitle(raw) {
  if (!raw) return "";
  return String(raw).replace(/[._]+/g, " ").replace(/\s+/g, " ").trim();
}

function stripReleaseJunk(name) {
  return String(name)
    .replace(/\b(480p|720p|1080p|2160p|4k)\b/gi, "")
    .replace(/\b(webrip|web[- ]?dl|bluray|brrip|hdtv|dvdrip)\b/gi, "")
    .replace(/\b(x264|x265|h264|h265|hevc|av1)\b/gi, "")
    .replace(/\b(aac|ac3|eac3|dts|truehd|opus)\b/gi, "")
    .replace(/\b(extended|remux|repack|proper)\b/gi, "")
    .replace(/\[.*?\]/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMediaFilename(fileName) {
  const base = path.basename(fileName, path.extname(fileName));
  const cleaned = stripReleaseJunk(base);

  let m = cleaned.match(/\bS(\d{1,2})\s*E(\d{1,2})\b/i);
  if (!m) {
    m = cleaned.match(/\b(\d{1,2})\s*x\s*(\d{1,2})\b/i);
  }

  if (m) {
    const season = Number(m[1]);
    const episode = Number(m[2]);
    const titlePart = cleaned.slice(0, m.index).trim();
    const title = cleanTitle(titlePart || cleaned);
    if (title && Number.isFinite(season) && Number.isFinite(episode)) {
      return { kind: "episode", title, season, episode };
    }
  }

  const title = cleanTitle(cleaned);
  if (!title) return null;
  return { kind: "movie", title };
}

async function scanDirRecursive(rootPath, out, options) {
  const { maxFiles } = options;
  if (out.length >= maxFiles) return;

  let entries;
  try {
    entries = await fs.promises.readdir(rootPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const ent of entries) {
    if (out.length >= maxFiles) return;
    const full = path.join(rootPath, ent.name);
    if (ent.isDirectory()) {
      const lower = ent.name.toLowerCase();
      if (lower === "sample" || lower === "samples") continue;
      await scanDirRecursive(full, out, options);
    } else if (ent.isFile()) {
      const ext = path.extname(ent.name).toLowerCase();
      if (!LOCAL_MEDIA_EXTS.has(ext)) continue;
      const parsed = parseMediaFilename(ent.name);
      if (!parsed) continue;
      out.push({ path: full, parsed });
    }
  }
}

async function scanLibraryRoots(roots) {
  const out = [];
  const options = { maxFiles: 20000 };
  for (const r of roots || []) {
    if (typeof r !== "string" || !r) continue;
    const resolved = path.resolve(r);
    await scanDirRecursive(resolved, out, options);
    if (out.length >= options.maxFiles) break;
  }
  return out;
}

module.exports = {
  scanLibraryRoots,
};
