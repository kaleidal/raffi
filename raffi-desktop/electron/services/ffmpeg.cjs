async function ensureFFmpegAvailable({ spawn, dialog, platform = process.platform }) {
  const ffmpegInstalled = await hasFFmpeg(spawn);

  if (!ffmpegInstalled) {
    const installed = await tryAutoInstallFFmpeg(spawn, platform);
    if (!installed || !(await hasFFmpeg(spawn))) {
      await dialog.showMessageBox({
        type: "error",
        buttons: ["Quit"],
        title: "FFmpeg Required",
        message: "FFmpeg was not found on this system.",
        detail: getManualInstallMessage(platform),
      });
      return false;
    }
  }

  if (!(await hasLibx264(spawn))) {
    await dialog.showMessageBox({
      type: "error",
      buttons: ["Quit"],
      title: "libx264 Encoder Required",
      message: "FFmpeg is missing the libx264 encoder.",
      detail: getLibx264InstallMessage(platform),
    });
    return false;
  }

  return true;
}

function commandExists(spawn, command, platform) {
  return new Promise((resolve) => {
    const checkCmd = platform === "win32" ? "where" : "which";
    const checker = spawn(checkCmd, [command]);
    checker.on("close", (code) => resolve(code === 0));
    checker.on("error", () => resolve(false));
  });
}

function hasFFmpeg(spawn) {
  return new Promise((resolve) => {
    const probe = spawn("ffmpeg", ["-version"]);
    probe.on("close", (code) => resolve(code === 0));
    probe.on("error", () => resolve(false));
  });
}

function hasLibx264(spawn) {
  return new Promise((resolve) => {
    const probe = spawn("ffmpeg", ["-encoders"]);
    let output = "";
    probe.stdout.on("data", (data) => {
      output += data.toString();
    });
    probe.on("close", (code) => {
      resolve(code === 0 && output.includes("libx264"));
    });
    probe.on("error", () => resolve(false));
  });
}

function runLoggedCommand(spawn, command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      ...options,
      stdio: "pipe",
    });

    if (child.stdout) {
      child.stdout.on("data", (data) => {
        console.log(`[${command}] ${data.toString()}`);
      });
    }
    if (child.stderr) {
      child.stderr.on("data", (data) => {
        console.error(`[${command} err] ${data.toString()}`);
      });
    }

    child.on("close", (code) => resolve(code === 0));
    child.on("error", (err) => {
      console.error(`${command} failed:`, err.message);
      resolve(false);
    });
  });
}

function runShellCommand(spawn, cmd, platform) {
  if (platform === "win32") {
    return runLoggedCommand(spawn, "powershell", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      cmd,
    ]);
  }
  return runLoggedCommand(spawn, "bash", ["-lc", cmd]);
}

async function installFFmpegOnWindows(spawn, platform) {
  const hasWinget = await commandExists(spawn, "winget", platform);
  if (!hasWinget) {
    console.warn("winget not available, cannot auto-install ffmpeg");
    return false;
  }
  console.log("Attempting to install FFmpeg via winget...");
  return runLoggedCommand(spawn, "winget", [
    "install",
    "--id",
    "FFmpeg.FFmpeg",
    "-e",
    "--accept-package-agreements",
    "--accept-source-agreements",
  ]);
}

async function installFFmpegOnLinux(spawn, platform) {
  const packageManagers = [
    {
      name: "apt-get",
      command: "sudo -n apt-get update ; sudo -n apt-get install -y ffmpeg",
    },
    {
      name: "dnf",
      command: "sudo -n dnf install -y ffmpeg",
    },
    {
      name: "pacman",
      command: "sudo -n pacman -Sy --noconfirm ffmpeg",
    },
  ];

  for (const pm of packageManagers) {
    if (await commandExists(spawn, pm.name, platform)) {
      console.log(`Attempting to install FFmpeg via ${pm.name}...`);
      const success = await runShellCommand(spawn, pm.command, platform);
      if (success) return true;
    }
  }
  return false;
}

async function tryAutoInstallFFmpeg(spawn, platform) {
  if (platform === "win32") {
    return installFFmpegOnWindows(spawn, platform);
  }
  if (platform === "linux") {
    return installFFmpegOnLinux(spawn, platform);
  }
  return false;
}

function getManualInstallMessage(platform) {
  if (platform === "win32") {
    return 'FFmpeg is required to start the local decoder. Please install it via https://ffmpeg.org or by running "winget install FFmpeg.FFmpeg" in PowerShell, then restart Raffi.';
  }
  if (platform === "darwin") {
    return 'FFmpeg is required to start the local decoder. Install it via Homebrew ("brew install ffmpeg") or from https://ffmpeg.org, then restart Raffi.';
  }
  return 'FFmpeg is required to start the local decoder. Install it with your package manager (for example: "sudo apt install ffmpeg") or from https://ffmpeg.org, then restart Raffi.';
}

function getLibx264InstallMessage(platform) {
  if (platform === "win32") {
    return 'FFmpeg is installed but missing the libx264 encoder. Please reinstall FFmpeg with x264 support from https://ffmpeg.org or via "winget install FFmpeg.FFmpeg", then restart Raffi.';
  }
  if (platform === "darwin") {
    return 'FFmpeg is installed but missing the libx264 encoder. Reinstall via Homebrew ("brew reinstall ffmpeg") to get x264 support, then restart Raffi.';
  }
  return `FFmpeg is installed but missing the libx264 encoder (needed for video transcoding).\n\nFor Fedora/RHEL: Enable RPM Fusion and run "sudo dnf install ffmpeg x264"\nFor Ubuntu/Debian: Run "sudo apt install ffmpeg libavcodec-extra"\nFor Arch: Run "sudo pacman -S ffmpeg x264"\n\nAfter installing, restart Raffi.`;
}

module.exports = {
  ensureFFmpegAvailable,
};
