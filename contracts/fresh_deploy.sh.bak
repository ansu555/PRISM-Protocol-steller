#!/usr/bin/env bash
set -e

[ -f "$HOME/.cargo/env" ] && source "$HOME/.cargo/env"
export PATH="$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"

# Find real anchor binary — AVM puts versioned binaries under ~/.avm/versions/
ANCHOR=$(find "$HOME/.avm/versions" -name "anchor" -type f 2>/dev/null | sort -V | tail -1)
# Fallback: cargo-installed anchor
[ -z "$ANCHOR" ] && ANCHOR="$HOME/.cargo/bin/anchor"
[ ! -f "$ANCHOR" ] && { echo "ERROR: cannot find anchor binary under ~/.avm/versions or ~/.cargo/bin"; exit 1; }

echo "anchor binary: $ANCHOR"
"$ANCHOR" --version
echo "solana: $(solana --version)"

CONTRACTS_DIR="/mnt/c/Users/manov/Desktop/code/PRISM-Protocol/contracts"
APP_DIR="/mnt/c/Users/manov/Desktop/code/PRISM-Protocol/app"
TARGET_DIR="/mnt/d/prism-target"
ADMIN_KEY="$CONTRACTS_DIR/keys/admin.json"

echo ""
echo "=== Step 1: Revert config seed to 'config' ==="
find "$CONTRACTS_DIR/programs/prism-core/src" -name "*.rs" \
  -exec sed -i 's/b"config2"/b"config"/g' {} +
echo "Done."

echo ""
echo "=== Step 2: Generate new program keypairs ==="
CORE_KP="$CONTRACTS_DIR/keys/prism_core_new.json"
AMM_KP="$CONTRACTS_DIR/keys/prism_amm_new.json"
solana-keygen new --outfile "$CORE_KP" --no-bip39-passphrase --force -s
solana-keygen new --outfile "$AMM_KP"  --no-bip39-passphrase --force -s
CORE_ID=$(solana-keygen pubkey "$CORE_KP")
AMM_ID=$(solana-keygen pubkey "$AMM_KP")
echo "prism_core: $CORE_ID"
echo "prism_amm:  $AMM_ID"

echo ""
echo "=== Step 3: Patch declare_id! and Anchor.toml ==="
# Read current IDs from source so re-runs work correctly
OLD_CORE=$(grep -o 'declare_id!("[A-Za-z0-9]*")' "$CONTRACTS_DIR/programs/prism-core/src/lib.rs" | grep -o '"[A-Za-z0-9]*"' | tr -d '"')
OLD_AMM=$(grep -o 'declare_id!("[A-Za-z0-9]*")' "$CONTRACTS_DIR/programs/prism-amm/src/lib.rs" | grep -o '"[A-Za-z0-9]*"' | tr -d '"')
echo "Replacing core: $OLD_CORE -> $CORE_ID"
echo "Replacing amm:  $OLD_AMM -> $AMM_ID"
sed -i "s/$OLD_CORE/$CORE_ID/g" "$CONTRACTS_DIR/programs/prism-core/src/lib.rs"
sed -i "s/$OLD_AMM/$AMM_ID/g"   "$CONTRACTS_DIR/programs/prism-amm/src/lib.rs"
sed -i "s/$OLD_CORE/$CORE_ID/g" "$CONTRACTS_DIR/Anchor.toml"
sed -i "s/$OLD_AMM/$AMM_ID/g"   "$CONTRACTS_DIR/Anchor.toml"
echo "IDs patched."

echo ""
echo "=== Step 4: Copy keypairs to target/deploy (Anchor 1.x keypair check) ==="
mkdir -p "$TARGET_DIR/deploy"
cp "$CORE_KP" "$TARGET_DIR/deploy/prism_core-keypair.json"
cp "$AMM_KP"  "$TARGET_DIR/deploy/prism_amm-keypair.json"
echo "Keypairs copied."

echo ""
echo "=== Step 5: Build ==="
cd "$CONTRACTS_DIR"
"$ANCHOR" build

echo ""
echo "=== Step 6: Fresh deploy ==="
solana program deploy "$TARGET_DIR/deploy/prism_core.so" \
  --keypair "$ADMIN_KEY" \
  --program-id "$CORE_KP" \
  --url devnet

solana program deploy "$TARGET_DIR/deploy/prism_amm.so" \
  --keypair "$ADMIN_KEY" \
  --program-id "$AMM_KP" \
  --url devnet

echo ""
echo "=== Step 7: Sync IDL + constants + .env.local ==="
cp "$TARGET_DIR/idl/prism_core.json" "$APP_DIR/lib/idl/prism_core.json"
cp "$TARGET_DIR/idl/prism_amm.json"  "$APP_DIR/lib/idl/prism_amm.json"
sed -i "s/$OLD_CORE/$CORE_ID/g" "$APP_DIR/lib/constants.ts"
sed -i "s/$OLD_AMM/$AMM_ID/g"   "$APP_DIR/lib/constants.ts"

ENV_FILE="/mnt/c/Users/manov/Desktop/code/PRISM-Protocol/.env.local"
sed -i "s/$OLD_CORE/$CORE_ID/g" "$ENV_FILE"
sed -i "s/$OLD_AMM/$AMM_ID/g"   "$ENV_FILE"
echo "IDL, constants.ts, and .env.local updated."

echo ""
echo "=== DONE ==="
echo "prism_core: $CORE_ID"
echo "prism_amm:  $AMM_ID"
echo ""
echo "Next steps:"
echo "  1. Restart dev server (bun dev)"
echo "  2. Open /admin, connect your Phantom wallet, click Run Full Setup"
