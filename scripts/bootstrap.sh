#!/usr/bin/env bash
set -e

echo "🚀 Raffi monorepo bootstrap"
echo ""

if ! command -v bun &> /dev/null; then
  echo "❌ Bun is required. Install from https://bun.sh"
  exit 1
fi

echo "📦 Installing dependencies (root + all workspaces)..."
# Use the direct bun command (never go through npm "install" lifecycle script)
bun install

echo ""
echo "✅ Done!"
echo ""
echo "Next steps:"
echo "  • Desktop:  bun run dev:desktop"
echo "  • Web:      cd apps/web && bun run dev"
echo "  • Full install (safe): bun run install:all"
echo "  • Check:    bun run check"
echo ""
echo "See STRUCTURE.md for the full layout."
