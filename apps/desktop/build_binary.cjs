const { spawn } = require("child_process");
const path = require("path");

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed with code ${code}`));
    });
    child.on("error", reject);
  });
}

async function build() {
  const platform = process.platform;
  const serverDir = path.join(__dirname, "..", "..", "services", "server");

  if (platform === "win32") {
    console.log("Building Windows binary (static CGO)...");
    await runCommand(
      "go",
      [
        "build",
        '-ldflags=-s -w -extldflags "-static"',
        "-tags=sqlite_omit_load_extension",
        "-o",
        "../../apps/desktop/electron/decoder-windows-amd64.exe",
        ".",
      ],
      {
        cwd: serverDir,
        env: {
          ...process.env,
          CGO_ENABLED: "1",
          CC: "gcc",
        },
      },
    );
  } else if (platform === "linux") {
    const linuxBuildOptions = {
      cwd: serverDir,
      env: {
        ...process.env,
        CGO_ENABLED: "1",
      },
    };
    const linuxBuildArgs = [
      "build",
      "-buildvcs=false",
      "-tags=sqlite_omit_load_extension netgo osusergo",
      "-o",
      "../../apps/desktop/electron/decoder-x86_64-unknown-linux-gnu",
      ".",
    ];

    console.log("Building Linux binary (static CGO, Go DNS resolver)...");
    try {
      await runCommand(
        "go",
        [
          linuxBuildArgs[0],
          linuxBuildArgs[1],
          '-ldflags=-s -w -extldflags "-static"',
          ...linuxBuildArgs.slice(2),
        ],
        linuxBuildOptions,
      );
    } catch (err) {
      console.warn("Static Linux build failed, retrying with dynamic linking:", err.message);
      await runCommand(
        "go",
        [linuxBuildArgs[0], linuxBuildArgs[1], "-ldflags=-s -w", ...linuxBuildArgs.slice(2)],
        linuxBuildOptions,
      );
    }
  } else if (platform === "darwin") {
    const macDecoders = [
      { goarch: "arm64", outputName: "decoder-aarch64-apple-darwin", cc: "clang -arch arm64" },
      { goarch: "amd64", outputName: "decoder-x86_64-apple-darwin", cc: "clang -arch x86_64" },
    ];
    for (const { goarch, outputName, cc } of macDecoders) {
      console.log(`Building macOS decoder (GOOS=darwin GOARCH=${goarch})...`);
      await runCommand(
        "go",
        [
          "build",
          "-ldflags=-s -w",
          "-tags=sqlite_omit_load_extension",
          "-o",
          `../../apps/desktop/electron/${outputName}`,
          ".",
        ],
        {
          cwd: serverDir,
          env: {
            ...process.env,
            CGO_ENABLED: "1",
            GOOS: "darwin",
            GOARCH: goarch,
            CC: cc,
          },
        },
      );
    }
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  console.log("Decoder binary built successfully (ffmpeg/ffprobe not bundled)");
}

build().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
