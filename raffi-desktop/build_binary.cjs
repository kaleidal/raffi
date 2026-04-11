const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const ffmpegStaticPkg = require('ffmpeg-static/package.json');
const ffmpegTag = ffmpegStaticPkg['ffmpeg-static']['binary-release-tag'];
const ffmpegBinary = require('ffmpeg-static');
const ffprobeBinary = require('ffprobe-static').path;

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
  const serverDir = path.join(__dirname, '..', 'raffi-server');
  const electronDir = path.join(__dirname, 'electron');
  
  if (platform === 'win32') {
    console.log('Building Windows binary (static CGO)...');
    await runCommand('go', [
      'build',
      '-ldflags=-s -w -extldflags "-static"',
      '-tags=sqlite_omit_load_extension',
      '-o',
      '../raffi-desktop/electron/decoder-windows-amd64.exe',
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
    console.log('Building Linux binary (static CGO)...');
    await runCommand('go', [
      'build',
      '-ldflags=-s -w -extldflags "-static"',
      '-tags=sqlite_omit_load_extension',
      '-o',
      '../raffi-desktop/electron/decoder-x86_64-unknown-linux-gnu',
      '.'
    ], {
      cwd: serverDir,
      env: {
        ...process.env,
        CGO_ENABLED: '1'
      }
    });
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
        `../raffi-desktop/electron/${outputName}`,
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
    await stageDarwinFfmpegPair(electronDir);
    await stageDarwinFfprobePair(electronDir);
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

async function downloadFfmpegDarwinGz(arch, destPath) {
  const url = `https://github.com/eugeneware/ffmpeg-static/releases/download/${ffmpegTag}/ffmpeg-darwin-${arch}.gz`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`ffmpeg download failed ${res.status}: ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const unpacked = zlib.gunzipSync(buf);
  await fs.promises.writeFile(destPath, unpacked);
  await fs.promises.chmod(destPath, 0o755);
  console.log(`Downloaded ffmpeg for darwin-${arch} to ${path.basename(destPath)}`);
}

async function stageDarwinFfmpegPair(electronDir) {
  const hostArch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const pairs = [
    { arch: 'arm64', dest: path.join(electronDir, 'ffmpeg-arm64') },
    { arch: 'x64', dest: path.join(electronDir, 'ffmpeg-x64') },
  ];
  for (const { arch, dest } of pairs) {
    if (arch === hostArch) {
      await fs.promises.copyFile(ffmpegBinary, dest);
      await fs.promises.chmod(dest, 0o755);
      console.log(`Staged ${path.basename(dest)} (native ${arch})`);
    } else {
      await downloadFfmpegDarwinGz(arch, dest);
    }
  }
}

async function stageDarwinFfprobePair(electronDir) {
  const root = path.join(__dirname, 'node_modules', 'ffprobe-static', 'bin', 'darwin');
  const pairs = [
    { arch: 'arm64', dest: path.join(electronDir, 'ffprobe-arm64') },
    { arch: 'x64', dest: path.join(electronDir, 'ffprobe-x64') },
  ];
  for (const { arch, dest } of pairs) {
    const src = path.join(root, arch, 'ffprobe');
    await fs.promises.copyFile(src, dest);
    await fs.promises.chmod(dest, 0o755);
    console.log(`Staged ffprobe-${arch}`);
  }
}

function executableName(baseName) {
  return process.platform === 'win32' ? `${baseName}.exe` : baseName;
}

build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
