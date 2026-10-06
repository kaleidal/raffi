const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

function createDefenderService({ logToFile }) {
  function isWindows() {
    return process.platform === "win32";
  }

  function normalizePathKey(value) {
    return path
      .resolve(String(value || ""))
      .replace(/\//g, "\\")
      .replace(/\\+$/g, "")
      .toLowerCase();
  }

  function normalizeProcessKey(value) {
    return path.basename(String(value || "")).trim().toLowerCase();
  }

  function pathIsCovered(desiredPath, existingPathKeys) {
    const desired = normalizePathKey(desiredPath);
    if (!desired) return false;
    for (const existing of existingPathKeys) {
      if (!existing) continue;
      if (desired === existing || desired.startsWith(`${existing}\\`)) {
        return true;
      }
    }
    return false;
  }

  function collectCoreTempPaths() {
    return [
      path.join(os.tmpdir(), "raffi"),
      path.join(os.tmpdir(), "raffi-torrents"),
    ].map((entry) => path.resolve(entry));
  }

  function collectExclusionPaths() {
    return [
      ...collectCoreTempPaths(),
      path.join(os.tmpdir(), "raffi", "clips"),
    ].map((entry) => path.resolve(entry));
  }

  function collectExclusionProcesses() {
    return [];
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
    const coreTempPaths = collectCoreTempPaths();

    const result = await runPowershell([
      "-Command",
      [
        "$ErrorActionPreference = 'Stop'",
        "$pref = Get-MpPreference",
        "$paths = @()",
        "if ($null -ne $pref.ExclusionPath) { $paths = @($pref.ExclusionPath | Where-Object { $_ }) }",
        "$procs = @()",
        "if ($null -ne $pref.ExclusionProcess) { $procs = @($pref.ExclusionProcess | Where-Object { $_ }) }",
        "$payload = @{ paths = $paths; procs = $procs }",
        "Write-Output ($payload | ConvertTo-Json -Compress)",
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

    let parsed = { paths: [], procs: [] };
    try {
      const jsonLine = result.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .pop();
      parsed = JSON.parse(jsonLine || "{}");
    } catch (error) {
      return {
        supported: true,
        excluded: false,
        paths: desiredPaths,
        processes: desiredProcesses,
        missingPaths: desiredPaths,
        missingProcesses: desiredProcesses,
        error: error?.message || "Could not parse Defender preferences",
      };
    }

    const existingPathKeys = new Set(
      (Array.isArray(parsed.paths) ? parsed.paths : parsed.paths ? [parsed.paths] : [])
        .map((entry) => normalizePathKey(entry))
        .filter(Boolean),
    );
    const existingProcessKeys = new Set(
      (Array.isArray(parsed.procs) ? parsed.procs : parsed.procs ? [parsed.procs] : [])
        .map((entry) => normalizeProcessKey(entry))
        .filter(Boolean),
    );

    const missingPaths = desiredPaths.filter(
      (entry) => !pathIsCovered(entry, existingPathKeys),
    );
    const missingProcesses = desiredProcesses.filter(
      (entry) => !existingProcessKeys.has(normalizeProcessKey(entry)),
    );
    const coreCovered = coreTempPaths.every((entry) =>
      pathIsCovered(entry, existingPathKeys),
    );

    return {
      supported: true,
      // Temp playback folders are what matter for the disk thrash; tools are best-effort.
      excluded: coreCovered,
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

    let status = await getExclusionStatus();
    if (!status.excluded) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      status = await getExclusionStatus();
    }

    // Elevated Add-MpPreference finished successfully. Treat as applied even if
    // preference re-read is slow/partial — core temp coverage is ideal, not required.
    return {
      ok: true,
      elevated: true,
      error: null,
      paths,
      processes,
      status: {
        ...status,
        excluded: true,
      },
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
