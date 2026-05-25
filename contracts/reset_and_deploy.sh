#!/usr/bin/env bash
set -e

source ~/.bashrc 2>/dev/null || true
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"

CONTRACTS_DIR="/mnt/c/Users/manov/Desktop/code/PRISM-Protocol/contracts"
APP_IDL_DIR="/mnt/c/Users/manov/Desktop/code/PRISM-Protocol/app/lib/idl"
TARGET_IDL_DIR="/mnt/c/Users/manov/Desktop/code/PRISM-Protocol/contracts/target/idl"
ADMIN_KEY="$CONTRACTS_DIR/keys/admin.json"

echo "=== Step 1: Replace b\"config\" with b\"config2\" in all Rust sources ==="
find "$CONTRACTS_DIR/programs/prism-core/src" -name "*.rs" -exec sed -i 's/b"config"/b"config2"/g' {} +
echo "Seed replaced in Rust files."

echo ""
echo "=== Step 2: Rebuild ==="
cd "$CONTRACTS_DIR"
anchor build

echo ""
echo "=== Step 3: Deploy prism_core ==="
anchor program deploy \
  target/deploy/prism_core.so \
  --program-keypair target/deploy/prism_core-keypair.json \
  --provider.cluster devnet \
  --provider.wallet "$ADMIN_KEY"

echo ""
echo "=== Step 4: Sync IDL ==="
cp "target/idl/prism_core.json" "$APP_IDL_DIR/prism_core.json"
cp "target/idl/prism_amm.json"  "$APP_IDL_DIR/prism_amm.json"
echo "IDL synced."

echo ""
echo "=== Done! Fresh config2 PDA — run Protocol Setup in the admin panel ==="
