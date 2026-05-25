#!/usr/bin/env bash
# Run from WSL: bash /mnt/c/Users/manov/Desktop/code/PRISM-Protocol/contracts/do_deploy.sh

set -e

# Source AVM + cargo env (handles anchor installed via avm)
[ -f "$HOME/.avm/env" ]   && source "$HOME/.avm/env"
[ -f "$HOME/.cargo/env" ] && source "$HOME/.cargo/env"

export PATH="$HOME/.avm/bin:$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"

# Resolve anchor binary — avm shim sometimes needs the active version path
ANCHOR_BIN="$(find "$HOME/.avm/bin" -name "anchor" -type f 2>/dev/null | head -1)"
if [ -z "$ANCHOR_BIN" ]; then
  ANCHOR_BIN="$(find "$HOME/.cargo/bin" -name "anchor" -type f 2>/dev/null | head -1)"
fi
[ -z "$ANCHOR_BIN" ] && { echo "ERROR: anchor binary not found"; exit 1; }

echo "Using anchor: $ANCHOR_BIN"
"$ANCHOR_BIN" --version || { echo "ERROR: anchor --version failed"; exit 1; }
SOLANA="$(which solana)" && echo "solana: $SOLANA"

# Use anchor via full path for all calls
ANCHOR="$ANCHOR_BIN"

CONTRACTS_DIR="/mnt/c/Users/manov/Desktop/code/PRISM-Protocol/contracts"
APP_IDL_DIR="/mnt/c/Users/manov/Desktop/code/PRISM-Protocol/app/lib/idl"
TARGET_IDL_DIR="/mnt/d/prism-target/idl"
ADMIN_KEY="$CONTRACTS_DIR/keys/admin.json"
CORE_SO="/mnt/d/prism-target/deploy/prism_core.so"
CORE_KP="/mnt/d/prism-target/deploy/prism_core-keypair.json"

echo ""
echo "=== Deploying prism_core (config2 seed) ==="
cd "$CONTRACTS_DIR"
"$ANCHOR" program deploy "$CORE_SO" \
  --program-keypair "$CORE_KP" \
  --provider.cluster devnet \
  --provider.wallet "$ADMIN_KEY"

echo ""
echo "=== Syncing IDL ==="
cp "$TARGET_IDL_DIR/prism_core.json" "$APP_IDL_DIR/prism_core.json"

echo ""
echo "=== Verifying ==="
node -e "
const idl = require('$APP_IDL_DIR/prism_core.json');
console.log('program:', idl.address);
console.log('instructions:', idl.instructions.map(i => i.name).join(', '));
"
echo "Done."
