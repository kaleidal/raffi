/**
 * ffmpeg-bundler.js
 *
 * Reusable module for downloading fresh, high-quality static FFmpeg + ffprobe
 * builds at packaging time.
 *
 * This replaces the old approach of shipping stale versions from the
 * `ffmpeg-static` / `ffprobe-static` npm packages.
 *
 * Supported sources (chosen per platform for best freshness + reliability):
 *   - BtbN (Linux + Windows)           → https://github.com/BtbN/FFmpeg-Builds
 *   - John Van Sickle (Linux)          → https://johnvansickle.com/ffmpeg/
 *   - Martin Riedl (macOS)             → https://ffmpeg.martin-riedl.de/
 *
 * Usage:
 *   const { downloadFfmpeg } = require('./ffmpeg-bundler');
 *
 *   await downloadFfmpeg({
 *     platform: 'linux',
 *     arch: 'amd64',
 *     destDir: path.join(__dirname, '../electron'),
 *     source: 'btbn'   // optional: 'btbn' | 'jvs'
 *   });
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SUPPORTED_SOURCES = ['btbn', 'jvs', 'martin-riedl'];

function getEnvSource() {
  const raw = (process.env.FFMPEG_SOURCE || 'btbn').toLowerCase();
  return SUPPORTED_SOURCES.includes(raw) ? raw : 'btbn';
}

/**
 * Main entry point.
 * Downloads ffmpeg + ffprobe for the requested platform/arch into destDir.
 *
 * By default this will skip the (slow) download if reasonably fresh binaries
 * already exist in destDir. Set FFMPEG_FORCE_DOWNLOAD=1 to always re-download.
 */
async function downloadFfmpeg({ platform, arch, destDir, source }) {
  let chosenSource = source || getEnvSource();

  // macOS has its own good source (BtbN/JVS don't support it)
  if (platform === 'darwin' && !source) {
    chosenSource = 'martin-riedl';
  }

  destDir = destDir || process.cwd();

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  // Skip download if binaries already exist (huge win for repeated dev runs)
  if (process.env.FFMPEG_FORCE_DOWNLOAD !== '1' && hasExistingBinaries(platform, destDir)) {
    console.log(`Using existing FFmpeg binaries in ${destDir} (set FFMPEG_FORCE_DOWNLOAD=1 to redownload)`);
    return true;
  }

  let result = null;

  switch (chosenSource) {
    case 'btbn':
      result = downloadBtbN(platform, arch, destDir);
      break;
    case 'jvs':
      result = downloadJohnVanSickle(arch, destDir);
      break;
    case 'martin-riedl':
      // For macOS we have a dedicated pair downloader
      if (platform === 'darwin') {
        result = await downloadMacosFfmpegPair(destDir);
      } else {
        result = downloadMartinRiedl(platform, arch, destDir);
      }
      break;
    default:
      console.warn(`Unknown source "${chosenSource}", falling back to btbn`);
      result = downloadBtbN(platform, arch, destDir);
  }

  if (!result) {
    console.warn(`Primary source (${chosenSource}) failed for ${platform}/${arch}.`);
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*                          Source Implementations                    */
/* ------------------------------------------------------------------ */

function downloadBtbN(platform, arch, destDir) {
  let url, tmpFile, isZip = false;

  if (platform === 'linux' && arch === 'amd64') {
    url = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz';
    tmpFile = path.join(destDir, 'ffmpeg-btbn-latest-linux64-gpl.tar.xz');
  } else if (platform === 'win32' && arch === 'x64') {
    url = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip';
    tmpFile = path.join(destDir, 'ffmpeg-btbn-latest-win64-gpl.zip');
    isZip = true;
  } else {
    return null;
  }

  console.log(`Downloading fresh BtbN FFmpeg for ${platform} ${arch}...`);
  console.log(`  ${url}`);

  try {
    downloadFile(url, tmpFile);

    const extractDir = path.join(destDir, `btbn-extract-${Date.now()}`);
    fs.mkdirSync(extractDir, { recursive: true });

    if (isZip) {
      execSync(`powershell -Command "Expand-Archive -Path '${tmpFile}' -DestinationPath '${extractDir}' -Force"`, { stdio: 'inherit' });
    } else {
      execSync(`tar -xJf "${tmpFile}" -C "${extractDir}"`, { stdio: 'inherit' });
    }

    const { foundFfmpeg, foundFfprobe } = findBinaries(extractDir, platform);

    if (!foundFfmpeg || !foundFfprobe) {
      throw new Error('Binaries not found after extraction');
    }

    const finalFfmpeg = path.join(destDir, platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
    const finalFfprobe = path.join(destDir, platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');

    fs.copyFileSync(foundFfmpeg, finalFfmpeg);
    fs.copyFileSync(foundFfprobe, finalFfprobe);

    if (platform !== 'win32') {
      fs.chmodSync(finalFfmpeg, 0o755);
      fs.chmodSync(finalFfprobe, 0o755);
    }

    cleanup([tmpFile, extractDir]);
    console.log('  → Successfully staged from BtbN');
    return { ffmpeg: finalFfmpeg, ffprobe: finalFfprobe };
  } catch (err) {
    console.warn(`  BtbN failed: ${err.message}`);
    cleanup([tmpFile]);
    return null;
  }
}

function downloadJohnVanSickle(arch, destDir) {
  if (process.platform !== 'linux' || arch !== 'amd64') return null;

  const version = process.env.FFMPEG_JVS_VERSION || 'latest';
  const url = version === 'latest'
    ? 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz'
    : `https://johnvansickle.com/ffmpeg/old-releases/ffmpeg-${version}-amd64-static.tar.xz`;

  const tmpTar = path.join(destDir, `ffmpeg-jvs-${version}-amd64-static.tar.xz`);

  console.log(`Downloading John Van Sickle FFmpeg (${version})...`);

  try {
    downloadFile(url, tmpTar);

    const extractDir = path.join(destDir, `jvs-extract-${Date.now()}`);
    fs.mkdirSync(extractDir, { recursive: true });
    execSync(`tar -xJf "${tmpTar}" -C "${extractDir}"`, { stdio: 'inherit' });

    const { foundFfmpeg, foundFfprobe } = findBinaries(extractDir, 'linux');

    if (!foundFfmpeg || !foundFfprobe) throw new Error('Binaries not found');

    const finalFfmpeg = path.join(destDir, 'ffmpeg');
    const finalFfprobe = path.join(destDir, 'ffprobe');

    fs.copyFileSync(foundFfmpeg, finalFfmpeg);
    fs.copyFileSync(foundFfprobe, finalFfprobe);
    fs.chmodSync(finalFfmpeg, 0o755);
    fs.chmodSync(finalFfprobe, 0o755);

    cleanup([tmpTar, extractDir]);
    console.log('  → Successfully staged from John Van Sickle');
    return { ffmpeg: finalFfmpeg, ffprobe: finalFfprobe };
  } catch (err) {
    console.warn(`  JVS failed: ${err.message}`);
    cleanup([tmpTar]);
    return null;
  }
}

function downloadMartinRiedl(platform, arch, destDir) {
  if (platform !== 'darwin') return null;

  const archName = arch === 'arm64' ? 'arm64' : 'amd64';
  const url = `https://ffmpeg.martin-riedl.de/redirect/latest/macos/${archName}/snapshot/ffmpeg.zip`;
  const tmpZip = path.join(destDir, `ffmpeg-macos-${arch}.zip`);

  console.log(`Downloading fresh macOS FFmpeg (${arch}) from Martin Riedl...`);

  try {
    downloadFile(url, tmpZip);

    const extractDir = path.join(destDir, `macos-extract-${arch}-${Date.now()}`);
    fs.mkdirSync(extractDir, { recursive: true });
    execSync(`unzip -o "${tmpZip}" -d "${extractDir}"`, { stdio: 'inherit' });

    const { foundFfmpeg } = findBinaries(extractDir, 'darwin');

    if (!foundFfmpeg) throw new Error('ffmpeg binary not found');

    const finalName = `ffmpeg-${arch}`;
    const finalPath = path.join(destDir, finalName);

    fs.copyFileSync(foundFfmpeg, finalPath);
    fs.chmodSync(finalPath, 0o755);

    cleanup([tmpZip, extractDir]);
    console.log(`  → Successfully downloaded fresh macOS ffmpeg for ${arch}`);
    return { ffmpeg: finalPath, ffprobe: null }; // ffprobe handled separately for now
  } catch (err) {
    console.warn(`  Martin Riedl failed for ${arch}: ${err.message}`);
    cleanup([tmpZip]);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*                            Helper Functions                        */
/* ------------------------------------------------------------------ */

function downloadFile(url, dest) {
  try {
    execSync(`curl -L --fail --progress-bar -o "${dest}" "${url}"`, { stdio: 'inherit' });
  } catch {
    execSync(`wget --show-progress -O "${dest}" "${url}"`, { stdio: 'inherit' });
  }
}

function findBinaries(searchDir, platform) {
  const binName = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const probeName = platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';

  const cmd = process.platform === 'win32'
    ? `powershell -Command "Get-ChildItem -Path '${searchDir}' -Recurse -Include '${binName}','${probeName}' | Select-Object -First 2 -ExpandProperty FullName"`
    : `find "${searchDir}" -type f \\( -name "${binName}" -o -name "${probeName}" \\) -perm -111`;

  try {
    const out = execSync(cmd, { encoding: 'utf8' }).trim().split(/\r?\n/);
    return {
      foundFfmpeg: out.find(p => p.includes(binName)) || null,
      foundFfprobe: out.find(p => p.includes(probeName)) || null,
    };
  } catch {
    return { foundFfmpeg: null, foundFfprobe: null };
  }
}

function cleanup(paths) {
  paths.forEach(p => {
    try { fs.rmSync(p, { recursive: true, force: true }); } catch {}
  });
}

/**
 * Returns true if the expected FFmpeg binaries for this platform already exist
 * in destDir. This lets us skip the expensive download on every `electron:dev`.
 */
function hasExistingBinaries(platform, destDir) {
  if (platform === 'linux') {
    return fs.existsSync(path.join(destDir, 'ffmpeg')) &&
           fs.existsSync(path.join(destDir, 'ffprobe'));
  }

  if (platform === 'win32') {
    return fs.existsSync(path.join(destDir, 'ffmpeg.exe')) &&
           fs.existsSync(path.join(destDir, 'ffprobe.exe'));
  }

  if (platform === 'darwin') {
    // We expect the per-arch files the rest of the app uses
    return fs.existsSync(path.join(destDir, 'ffmpeg-arm64')) &&
           fs.existsSync(path.join(destDir, 'ffmpeg-x64')) &&
           fs.existsSync(path.join(destDir, 'ffprobe-arm64')) &&
           fs.existsSync(path.join(destDir, 'ffprobe-x64'));
  }

  return false;
}

module.exports = {
  downloadFfmpeg,
  SUPPORTED_SOURCES,
  downloadBtbN,
  downloadJohnVanSickle,
  downloadMartinRiedl,
};

/**
 * Downloads fresh macOS ffmpeg + ffprobe for both architectures using
 * Martin Riedl’s excellent redirect service (signed + notarized builds).
 *
 * Places files as:
 *   ffmpeg-arm64, ffmpeg-x64
 *   ffprobe-arm64, ffprobe-x64
 *
 * This matches what the rest of the desktop app currently expects.
 */
async function downloadMacosFfmpegPair(destDir) {
  const arches = ['arm64', 'x64'];
  let anySuccess = false;

  for (const arch of arches) {
    const archName = arch === 'arm64' ? 'arm64' : 'amd64';

    // ffmpeg
    const ffmpegUrl = `https://ffmpeg.martin-riedl.de/redirect/latest/macos/${archName}/snapshot/ffmpeg.zip`;
    const ffmpegDest = path.join(destDir, `ffmpeg-${arch}`);

    if (await downloadMacosBinary(ffmpegUrl, ffmpegDest, `ffmpeg-${arch}`)) {
      anySuccess = true;
    }

    // ffprobe
    const ffprobeUrl = `https://ffmpeg.martin-riedl.de/redirect/latest/macos/${archName}/snapshot/ffprobe.zip`;
    const ffprobeDest = path.join(destDir, `ffprobe-${arch}`);

    if (await downloadMacosBinary(ffprobeUrl, ffprobeDest, `ffprobe-${arch}`)) {
      anySuccess = true;
    }
  }

  return anySuccess;
}

async function downloadMacosBinary(url, destPath, label) {
  const tmpZip = destPath + '.zip';
  const extractDir = destPath + '-extract';

  try {
    console.log(`  Downloading fresh macOS ${label}...`);
    downloadFile(url, tmpZip);

    fs.mkdirSync(extractDir, { recursive: true });
    execSync(`unzip -o "${tmpZip}" -d "${extractDir}"`, { stdio: 'inherit' });

    const found = execSync(
      `find "${extractDir}" -type f -name "ffmpeg" -o -name "ffprobe" | head -1`,
      { encoding: 'utf8' }
    ).trim();

    if (!found) throw new Error(`Binary not found in ${label} archive`);

    fs.copyFileSync(found, destPath);
    fs.chmodSync(destPath, 0o755);

    cleanup([tmpZip, extractDir]);
    console.log(`    → ${label} ready`);
    return true;
  } catch (err) {
    console.warn(`    Failed to download ${label}: ${err.message}`);
    cleanup([tmpZip, extractDir]);
    return false;
  }
}

// Make sure downloadFile and cleanup are available (they are defined above in the file)
