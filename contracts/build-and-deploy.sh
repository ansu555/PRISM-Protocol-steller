#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# PRISM Protocol — build, deploy, and IDL sync
#
# Run this script from the contracts/ directory in your WSL / Linux environment
# that has a working Anchor + Solana SBF toolchain.
#
# Prerequisites:
#   - Anchor CLI 0.30.x  (`anchor --version`)
#   - Solana CLI 1.18+   (`solana --version`)
#   - Wallet funded on devnet: contracts/keys/admin.json
#
# Usage:
#   cd contracts
#   bash build-and-deploy.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

IDL_DEST="../app/lib/idl"
KEYS_DIR="./keys"
CLUSTER="devnet"

echo "═══════════════════════════════════════"
echo "  PRISM Protocol — build & deploy"
echo "═══════════════════════════════════════"

# ── 1. Build ─────────────────────────────────────────────────────────────────
echo ""
echo "▶ Building programs…"
anchor build 2>&1 | tail -20

echo ""
echo "✓ Build complete"

# ── 2. Show generated program IDs ────────────────────────────────────────────
echo ""
echo "▶ Program IDs from Anchor.toml:"
grep "^\[programs" -A 2 Anchor.toml | grep -v "^\[" || true

# ── 3. Deploy prism-core ─────────────────────────────────────────────────────
echo ""
echo "▶ Deploying prism-core to $CLUSTER…"
anchor deploy \
  --provider.cluster "$CLUSTER" \
  --provider.wallet "$KEYS_DIR/admin.json" \
  --program-name prism-core \
  2>&1 | tail -10

# ── 4. Deploy prism-amm ──────────────────────────────────────────────────────
echo ""
echo "▶ Deploying prism-amm to $CLUSTER…"
anchor deploy \
  --provider.cluster "$CLUSTER" \
  --provider.wallet "$KEYS_DIR/admin.json" \
  --program-name prism-amm \
  2>&1 | tail -10

echo ""
echo "✓ Deploy complete"

# ── 5. Sync IDL files to frontend ────────────────────────────────────────────
echo ""
echo "▶ Syncing IDL files to $IDL_DEST…"
mkdir -p "$IDL_DEST"
cp target/idl/prism_core.json "$IDL_DEST/prism_core.json"
cp target/idl/prism_amm.json  "$IDL_DEST/prism_amm.json"
echo "✓ IDL synced"

echo ""
echo "═══════════════════════════════════════"
echo "  Done!  Commit the updated IDL files."
echo "  git add app/lib/idl && git commit -m 'build(core): rebuild with IKA collateral instructions'"
echo "═══════════════════════════════════════"
