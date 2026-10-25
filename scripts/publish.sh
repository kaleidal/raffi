#!/usr/bin/env bash
# Release Raffi end to end:
#   scripts/publish.sh 0.15.1
#   scripts/publish.sh 0.15.1 --notes notes.md --summary "One line for Flathub" --yes
#
# 1. Checks you're on an up-to-date, clean main and the version isn't released yet.
# 2. Applies pending sync D1 migrations (main auto-deploys the Worker, so tables go first).
# 3. Bumps the app and desktop versions, the lockfile and the Flatpak release notes,
#    then commits "Release <version>" and pushes main. Skipped when main already has it.
# 4. Runs the Manual Build and Release workflow and waits for it.
# 5. Sets the release notes on the draft release and publishes it.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/publish.sh <version> [options]

Options:
  --notes FILE      Markdown release notes. Without it, $EDITOR opens a template.
  --summary TEXT    One-line summary for the Flatpak metainfo. Asked for when needed.
  --draft           Leave the GitHub release as a draft instead of publishing it.
  --yes             Don't ask for confirmation.
  -h, --help        Show this help.
EOF
}

VERSION=""
NOTES_FILE=""
SUMMARY=""
KEEP_DRAFT=false
ASSUME_YES=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --notes) NOTES_FILE="${2:?--notes needs a file}"; shift 2 ;;
    --summary) SUMMARY="${2:?--summary needs text}"; shift 2 ;;
    --draft) KEEP_DRAFT=true; shift ;;
    --yes|-y) ASSUME_YES=true; shift ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "❌ Unknown option: $1"; usage; exit 1 ;;
    *) VERSION="${1#v}"; shift ;;
  esac
done

fail() { echo "❌ $*" >&2; exit 1; }
step() { echo ""; echo "▶ $*"; }
confirm() {
  $ASSUME_YES && return 0
  read -r -p "$1 [y/N] " answer
  [[ "$answer" =~ ^[Yy]$ ]]
}

[[ -n "$VERSION" ]] || { usage; exit 1; }
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "Version must look like 1.2.3, got '$VERSION'"
TAG="v$VERSION"
WORKFLOW="manual_release.yml"
METAINFO="apps/desktop/flatpak/al.kaleid.raffi.metainfo.xml"

cd "$(dirname "$0")/.."

step "Checking tools"
for tool in bun gh git; do
  command -v "$tool" &> /dev/null || fail "$tool is required"
done
gh auth status &> /dev/null || fail "gh isn't signed in. Run: gh auth login"

step "Checking main"
[[ "$(git branch --show-current)" == "main" ]] || fail "Switch to main first"
[[ -z "$(git status --porcelain)" ]] || fail "Working tree has uncommitted changes"
git fetch --quiet origin main
[[ "$(git rev-parse HEAD)" == "$(git rev-parse origin/main)" ]] || fail "main isn't in sync with origin/main. Pull or push first"

if [[ "$(gh release view "$TAG" --json isDraft --jq .isDraft 2>/dev/null)" == "false" ]]; then
  fail "$TAG is already published"
fi

CURRENT="$(bun -e "console.log(require('./apps/desktop/package.json').version)")"
NEEDS_BUMP=false
[[ "$CURRENT" == "$VERSION" ]] || NEEDS_BUMP=true
echo "Current version: $CURRENT → releasing $VERSION"

# Gather everything interactive up front so the rest can run unattended.
if [[ -z "$NOTES_FILE" ]]; then
  NOTES_FILE="$(mktemp "${TMPDIR:-/tmp}/raffi-$VERSION-notes.XXXXXX")"
  cat > "$NOTES_FILE" <<'EOF'
# Headline goes here.

> One or two sentences about the release.

---

*
EOF
  "${EDITOR:-vi}" "$NOTES_FILE"
fi
[[ -s "$NOTES_FILE" ]] || fail "Release notes are empty"
grep -q "Headline goes here" "$NOTES_FILE" && fail "Release notes still have the template headline"

if $NEEDS_BUMP && [[ -z "$SUMMARY" ]] && ! grep -q "<release version=\"$VERSION\"" "$METAINFO"; then
  read -r -p "One-line Flatpak summary for $VERSION: " SUMMARY
  [[ -n "$SUMMARY" ]] || fail "The Flatpak summary can't be empty"
fi

echo ""
echo "About to release $TAG:"
$NEEDS_BUMP && echo "  • bump $CURRENT → $VERSION, commit and push to main"
echo "  • apply any pending sync D1 migrations"
echo "  • run the $WORKFLOW workflow and wait for it"
if $KEEP_DRAFT; then echo "  • leave the release as a draft"; else echo "  • publish the release"; fi
confirm "Continue?" || fail "Cancelled"

step "Applying pending sync D1 migrations"
# Workers Builds deploys main as soon as it's pushed, so the tables have to exist first.
(cd services/sync && bunx wrangler d1 migrations apply raffi-sync --remote)

if $NEEDS_BUMP; then
  step "Bumping to $VERSION"
  RAFFI_VERSION="$VERSION" RAFFI_SUMMARY="$SUMMARY" bun -e '
    const fs = require("fs");
    const version = process.env.RAFFI_VERSION;
    for (const file of ["apps/desktop/package.json", "packages/app/package.json"]) {
      const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
      pkg.version = version;
      fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
    }

    const metainfo = "apps/desktop/flatpak/al.kaleid.raffi.metainfo.xml";
    const xml = fs.readFileSync(metainfo, "utf8");
    if (!xml.includes(`<release version="${version}"`)) {
      const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const date = new Date().toISOString().slice(0, 10);
      const entry = [
        `    <release version="${version}" date="${date}">`,
        "      <description>",
        `        <p>${escape(process.env.RAFFI_SUMMARY)}</p>`,
        "      </description>",
        "    </release>",
      ].join("\n");
      if (!xml.includes("  <releases>\n")) throw new Error("No <releases> block in " + metainfo);
      fs.writeFileSync(metainfo, xml.replace("  <releases>\n", `  <releases>\n${entry}\n`));
    }
  '
  bun install --silent

  step "Checking the build"
  bun run check

  step "Committing and pushing"
  git add apps/desktop/package.json packages/app/package.json bun.lock "$METAINFO"
  git commit -m "Release $VERSION"
  git push origin main
else
  echo ""
  echo "main is already at $VERSION, skipping the bump"
fi

step "Starting the $WORKFLOW workflow"
HEAD_SHA="$(git rev-parse HEAD)"
gh workflow run "$WORKFLOW" --ref main

RUN_ID=""
for _ in $(seq 1 30); do
  RUN_ID="$(gh run list --workflow "$WORKFLOW" --branch main --event workflow_dispatch --limit 5 \
    --json databaseId,headSha --jq "map(select(.headSha == \"$HEAD_SHA\")) | .[0].databaseId // empty")"
  [[ -n "$RUN_ID" ]] && break
  sleep 2
done
[[ -n "$RUN_ID" ]] || fail "Couldn't find the workflow run. Check the Actions tab"

echo "Watching run $RUN_ID (Ctrl+C stops watching, not the build)"
gh run watch "$RUN_ID" --exit-status || fail "The release workflow failed. See: gh run view $RUN_ID --log-failed"

step "Updating the $TAG release"
gh release edit "$TAG" --title "$VERSION" --notes-file "$NOTES_FILE"

if $KEEP_DRAFT; then
  echo ""
  echo "✅ $TAG is built and waiting as a draft: $(gh release view "$TAG" --json url --jq .url)"
  exit 0
fi

gh release edit "$TAG" --draft=false --latest
echo ""
echo "✅ Released $TAG: $(gh release view "$TAG" --json url --jq .url)"
