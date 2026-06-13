const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execSync } = require('child_process');

const ffmpegStaticPkg = require('ffmpeg-static/package.json');
const ffmpegTag = ffmpegStaticPkg['ffmpeg-static']['binary-release-tag'];
const ffmpegBinary = require('ffmpeg-static');
const ffprobeBinary = require('ffprobe-static').path;

// Import the reusable bundler
const { downloadFfmpeg } = require('./scripts/ffmpeg-bundler.cjs');

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed with code ${code}`));
    });
    child.on('error', reject);
  });
}

async function build() {
  const platform = process.platform;
  const serverDir = path.join(__dirname, '..', '..', 'services', 'server');
  const electronDir = path.join(__dirname, 'electron');
  
  if (platform === 'win32') {
    console.log('Building Windows binary (static CGO)...');
    await runCommand('go', [
      'build',
      '-ldflags=-s -w -extldflags "-static"',
      '-tags=sqlite_omit_load_extension',
      '-o',
      '../../apps/desktop/electron/decoder-windows-amd64.exe',
      '.'
    ], {
      cwd: serverDir,
      env: {
        ...process.env,
        CGO_ENABLED: '1',
        CC: 'gcc'
      }
    });
  } else if (platform === 'linux') {
    const linuxBuildOptions = {
      cwd: serverDir,
      env: {
        ...process.env,
        CGO_ENABLED: '1'
      }
    };
    const linuxBuildArgs = [
      'build',
      '-buildvcs=false',
      '-tags=sqlite_omit_load_extension netgo osusergo',
      '-o',
      '../../apps/desktop/electron/decoder-x86_64-unknown-linux-gnu',
      '.'
    ];

    console.log('Building Linux binary (static CGO, Go DNS resolver)...');
    try {
      await runCommand('go', [
        linuxBuildArgs[0],
        linuxBuildArgs[1],
        '-ldflags=-s -w -extldflags "-static"',
        ...linuxBuildArgs.slice(2),
      ], linuxBuildOptions);
    } catch (err) {
      console.warn('Static Linux build failed, retrying with dynamic linking:', err.message);
      await runCommand('go', [
        linuxBuildArgs[0],
        linuxBuildArgs[1],
        '-ldflags=-s -w',
        ...linuxBuildArgs.slice(2),
      ], linuxBuildOptions);
    }
  } else if (platform === 'darwin') {
    const macDecoders = [
      { goarch: 'arm64', outputName: 'decoder-aarch64-apple-darwin', cc: 'clang -arch arm64' },
      { goarch: 'amd64', outputName: 'decoder-x86_64-apple-darwin', cc: 'clang -arch x86_64' },
    ];
    for (const { goarch, outputName, cc } of macDecoders) {
      console.log(`Building macOS decoder (GOOS=darwin GOARCH=${goarch})...`);
      await runCommand('go', [
        'build',
        '-ldflags=-s -w',
        '-tags=sqlite_omit_load_extension',
        '-o',
        `../../apps/desktop/electron/${outputName}`,
        '.'
      ], {
        cwd: serverDir,
        env: {
          ...process.env,
          CGO_ENABLED: '1',
          GOOS: 'darwin',
          GOARCH: goarch,
          CC: cc,
        },
      });
    }
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  if (platform === 'darwin') {
    const success = await downloadFfmpeg({ platform: 'darwin', destDir: electronDir });
    if (!success) {
      console.log('Falling back to npm package binaries for macOS');
      await stageMediaTool(ffmpegBinary, path.join(electronDir, 'ffmpeg-arm64'));
      await stageMediaTool(ffmpegBinary, path.join(electronDir, 'ffmpeg-x64'));
      await stageMediaTool(ffprobeBinary, path.join(electronDir, 'ffprobe-arm64'));
      await stageMediaTool(ffprobeBinary, path.join(electronDir, 'ffprobe-x64'));
    }
  } else if (platform === 'linux') {
    const success = await downloadFfmpeg({ platform: 'linux', arch: 'amd64', destDir: electronDir });
    if (!success) {
      console.log('Falling back to npm package binaries for Linux');
      await stageMediaTool(ffmpegBinary, path.join(electronDir, executableName('ffmpeg')));
      await stageMediaTool(ffprobeBinary, path.join(electronDir, executableName('ffprobe')));
    }
  } else if (platform === 'win32') {
    const success = await downloadFfmpeg({ platform: 'win32', arch: 'x64', destDir: electronDir });
    if (!success) {
      console.log('Falling back to npm package binaries for Windows');
      await stageMediaTool(ffmpegBinary, path.join(electronDir, executableName('ffmpeg')));
      await stageMediaTool(ffprobeBinary, path.join(electronDir, executableName('ffprobe')));
    }
  } else {
    await stageMediaTool(ffmpegBinary, path.join(electronDir, executableName('ffmpeg')));
    await stageMediaTool(ffprobeBinary, path.join(electronDir, executableName('ffprobe')));
  }
  
  console.log('Binary built successfully');
}

async function stageMediaTool(sourcePath, targetPath) {
  if (!sourcePath) {
    throw new Error(`Missing media tool binary for ${targetPath}`);
  }

  await fs.promises.copyFile(sourcePath, targetPath);
  if (process.platform !== 'win32') {
    await fs.promises.chmod(targetPath, 0o755);
  }
  console.log(`Staged ${path.basename(targetPath)} from ${sourcePath}`);
}

/**
 * Download fresh static FFmpeg builds for macOS using Martin Riedl’s service.
 * This is currently one of the best sources for up-to-date, signed macOS builds
 * (both arm64 and x64).
 *
 * Note: As of mid-2026, arm64 builds are updated much more actively than x64.
 */
async function downloadFreshMacosFfmpeg(arch, destPath) {
  const archName = arch === 'arm64' ? 'arm64' : 'amd64';
  // Prefer snapshot for freshness (you can change to "release" if you want stable only)
  const url = `https://ffmpeg.martin-riedl.de/redirect/latest/macos/${archName}/snapshot/ffmpeg.zip`;

  console.log(`Downloading fresh macOS FFmpeg (snapshot) for ${arch} from Martin Riedl...`);
  console.log(`  ${url}`);

  const tmpZip = path.join(path.dirname(destPath), `ffmpeg-macos-${arch}.zip`);

  try {
    try {
      execSync(`curl -L --fail --progress-bar -o "${tmpZip}" "${url}"`, { stdio: 'inherit' });
    } catch {
      execSync(`wget --show-progress -O "${tmpZip}" "${url}"`, { stdio: 'inherit' });
    }

    // Extract the zip (we'll use a small node unzip or shell)
    const extractDir = path.join(path.dirname(destPath), `macos-extract-${arch}-${Date.now()}`);
    fs.mkdirSync(extractDir, { recursive: true });

    // Use unzip if available, otherwise fall back to node (but unzip is usually there on mac dev machines)
    try {
      execSync(`unzip -o "${tmpZip}" -d "${extractDir}"`, { stdio: 'inherit' });
    } catch {
      // Very basic fallback using adm-zip would require adding a dep. For build scripts, unzip is fine.
      throw new Error('unzip command not found. Please install it (brew install unzip).');
    }

    // The zip usually contains the binary directly or in a folder
    const findBin = (name) => {
      try {
        const out = execSync(
          `find "${extractDir}" -type f -name "${name}" -perm -111 | head -1`,
          { encoding: 'utf8' }
        ).trim();
        return out || null;
      } catch { return null; }
    };

    const found = findBin('ffmpeg');
    if (!found) {
      throw new Error('Could not find ffmpeg binary inside downloaded macOS zip');
    }

    fs.copyFileSync(found, destPath);
    fs.chmodSync(destPath, 0o755);

    fs.rmSync(tmpZip, { force: true });
    fs.rmSync(extractDir, { recursive: true, force: true });

    console.log(`  → Downloaded fresh macOS ffmpeg for ${arch}`);
    return true;
  } catch (err) {
    console.warn(`  → Failed to download fresh macOS ffmpeg for ${arch}: ${err.message}`);
    try { fs.rmSync(tmpZip, { force: true }); } catch {}
    return false;
  }
}

function executableName(baseName) {
  return process.platform === 'win32' ? `${baseName}.exe` : baseName;
}

build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
