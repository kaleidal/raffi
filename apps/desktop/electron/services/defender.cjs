const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

function createDefenderService({ logToFile, getDecoderBinaryPath, getBundledToolPaths }) {
  function isWindows() {
    return process.platform === "win32";
  }

  function collectExclusionPaths() {
    const paths = new Set([
      path.join(os.tmpdir(), "raffi"),
      path.join(os.tmpdir(), "raffi-torrents"),
      path.join(os.tmpdir(), "raffi", "clips"),
    ]);

    try {
      const decoderPath = typeof getDecoderBinaryPath === "function" ? getDecoderBinaryPath() : null;
      if (decoderPath) {
        paths.add(path.dirname(decoderPath));
      }
    } catch (error) {
      logToFile?.("Failed resolving decoder path for Defender exclusions", error);
    }

    try {
      const tools = typeof getBundledToolPaths === "function" ? getBundledToolPaths() : null;
      if (tools?.ffmpeg) paths.add(path.dirname(tools.ffmpeg));
      if (tools?.ffprobe) paths.add(path.dirname(tools.ffprobe));
    } catch (error) {
      logToFile?.("Failed resolving media tool paths for Defender exclusions", error);
    }

    return [...paths].map((entry) => path.resolve(entry));
  }

  function collectExclusionProcesses() {
    const processes = new Set(["ffmpeg.exe", "ffprobe.exe"]);
    try {
      const decoderPath = typeof getDecoderBinaryPath === "function" ? getDecoderBinaryPath() : null;
      if (decoderPath) {
        processes.add(path.basename(decoderPath));
      }
    } catch {
      // ignore
    }
    return [...processes];
  }

  function ensureDirectories(paths) {
    for (const entry of paths) {
      try {
        fs.mkdirSync(entry, { recursive: true });
      } catch {
        // ignore
      }
    }
  }

  function runPowershell(args, { timeoutMs = 60_000 } = {}) {
    return new Promise((resolve) => {
      const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", ...args], {
        windowsHide: true,
      });
      let stdout = "";
      let stderr = "";
      let settled = false;

      const finish = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      const timer = setTimeout(() => {
        try {
          child.kill();
        } catch {
          // ignore
        }
        finish({
          ok: false,
          code: null,
          stdout,
          stderr: stderr || "PowerShell timed out",
        });
      }, timeoutMs);

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        finish({ ok: false, code: null, stdout, stderr: error?.message || String(error) });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        finish({
          ok: code === 0,
          code,
          stdout,
          stderr,
        });
      });
    });
  }

  async function getExclusionStatus() {
    if (!isWindows()) {
      return {
        supported: false,
        excluded: false,
        paths: [],
        processes: [],
        missingPaths: [],
        missingProcesses: [],
        error: "Windows only",
      };
    }

    const desiredPaths = collectExclusionPaths();
    const desiredProcesses = collectExclusionProcesses();

    const result = await runPowershell([
      "-Command",
      [
        "$ErrorActionPreference = 'Stop'",
        "$pref = Get-MpPreference",
        "$paths = @($pref.ExclusionPath)",
        "$procs = @($pref.ExclusionProcess)",
        "Write-Output ('PATHS=' + (($paths | ForEach-Object { $_.ToLowerInvariant() }) -join '|'))",
        "Write-Output ('PROCS=' + (($procs | ForEach-Object { $_.ToLowerInvariant() }) -join '|'))",
      ].join("; "),
    ]);

    if (!result.ok) {
      return {
        supported: true,
        excluded: false,
        paths: desiredPaths,
        processes: desiredProcesses,
        missingPaths: desiredPaths,
        missingProcesses: desiredProcesses,
        error: result.stderr || "Could not read Microsoft Defender preferences",
      };
    }

    const lines = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const pathsLine = lines.find((line) => line.startsWith("PATHS=")) || "PATHS=";
    const procsLine = lines.find((line) => line.startsWith("PROCS=")) || "PROCS=";
    const existingPaths = new Set(
      pathsLine
        .slice("PATHS=".length)
        .split("|")
        .map((value) => value.trim())
        .filter(Boolean),
    );
    const existingProcesses = new Set(
      procsLine
        .slice("PROCS=".length)
        .split("|")
        .map((value) => value.trim())
        .filter(Boolean),
    );

    const missingPaths = desiredPaths.filter(
      (entry) => !existingPaths.has(entry.toLowerCase()),
    );
    const missingProcesses = desiredProcesses.filter(
      (entry) => !existingProcesses.has(entry.toLowerCase()),
    );

    return {
      supported: true,
      excluded: missingPaths.length === 0 && missingProcesses.length === 0,
      paths: desiredPaths,
      processes: desiredProcesses,
      missingPaths,
      missingProcesses,
      error: null,
    };
  }

  async function applyExclusions() {
    if (!isWindows()) {
      return { ok: false, elevated: false, error: "Windows only" };
    }

    const paths = collectExclusionPaths();
    const processes = collectExclusionProcesses();
    ensureDirectories(paths);

    const scriptPath = path.join(os.tmpdir(), `raffi-defender-exclude-${Date.now()}.ps1`);
    const pathLiteral = paths
      .map((entry) => `'${entry.replace(/'/g, "''")}'`)
      .join(", ");
    const processLiteral = processes
      .map((entry) => `'${entry.replace(/'/g, "''")}'`)
      .join(", ");

    const script = [
      "$ErrorActionPreference = 'Stop'",
      `$paths = @(${pathLiteral})`,
      `$procs = @(${processLiteral})`,
      "foreach ($p in $paths) {",
      "  if (-not (Test-Path -LiteralPath $p)) { New-Item -ItemType Directory -Force -Path $p | Out-Null }",
      "  Add-MpPreference -ExclusionPath $p",
      "}",
      "foreach ($proc in $procs) {",
      "  Add-MpPreference -ExclusionProcess $proc",
      "}",
      "Write-Output 'OK'",
    ].join("\r\n");

    try {
      fs.writeFileSync(scriptPath, script, "utf8");
    } catch (error) {
      return {
        ok: false,
        elevated: false,
        error: error?.message || "Failed to write exclusion script",
      };
    }

    const escapedScript = scriptPath.replace(/'/g, "''");
    const elevateCommand = [
      "$ErrorActionPreference = 'Stop'",
      `$p = Start-Process -FilePath powershell.exe -Verb RunAs -Wait -PassThru -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File','${escapedScript}')`,
      "if ($null -eq $p) { exit 1 }",
      "exit $p.ExitCode",
    ].join("; ");

    const result = await runPowershell(["-Command", elevateCommand], { timeoutMs: 180_000 });

    try {
      fs.unlinkSync(scriptPath);
    } catch {
      // ignore
    }

    if (!result.ok) {
      const message =
        result.stderr ||
        result.stdout ||
        "Exclusion failed. You may have cancelled the Administrator prompt.";
      logToFile?.("Defender exclusion failed", message);
      return { ok: false, elevated: true, error: message, paths, processes };
    }

    const status = await getExclusionStatus();
    return {
      ok: status.excluded,
      elevated: true,
      error: status.excluded ? null : status.error || "Exclusions were applied but could not be verified",
      paths,
      processes,
      status,
    };
  }

  return {
    isWindows,
    getExclusionStatus,
    applyExclusions,
    collectExclusionPaths,
    collectExclusionProcesses,
  };
}

module.exports = {
  createDefenderService,
};
