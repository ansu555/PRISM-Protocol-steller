#!/usr/bin/env bash
set -e

CONTRACTS_DIR="/mnt/c/Users/manov/Desktop/code/PRISM-Protocol/contracts"
APP_IDL_DIR="/mnt/c/Users/manov/Desktop/code/PRISM-Protocol/app/lib/idl"
TARGET_IDL_DIR="/mnt/d/prism-target/idl"
ADMIN_KEY="$CONTRACTS_DIR/keys/admin.json"
PRISM_CORE_ID="E3g9dfc7Azz9MZcM9vJPeWA8JKN3rrU7k35KBm5chcL6"

source ~/.bashrc 2>/dev/null || true
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"

ADMIN_PUBKEY=$(solana-keygen pubkey "$ADMIN_KEY")
echo "Admin: $ADMIN_PUBKEY"

# ── Airdrop until admin has ≥ 4.5 SOL ────────────────────────────────────────
for attempt in 1 2 3 4; do
  BAL=$(solana balance "$ADMIN_PUBKEY" --url devnet | awk '{print $1}')
  echo "Balance: $BAL SOL"
  if (( $(echo "$BAL >= 4.5" | bc -l) )); then
    break
  fi
  echo "Airdropping 2 SOL (attempt $attempt)..."
  solana airdrop 2 "$ADMIN_PUBKEY" --url devnet || echo "Airdrop failed — rate limited, continuing"
  sleep 5
done

BAL=$(solana balance "$ADMIN_PUBKEY" --url devnet | awk '{print $1}')
echo "Final balance before deploy: $BAL SOL"

if (( $(echo "$BAL < 4.0" | bc -l) )); then
  echo "ERROR: Need at least 4 SOL but only have $BAL. Run the airdrop manually:"
  echo "  solana airdrop 2 $ADMIN_PUBKEY --url devnet"
  exit 1
fi

# ── Deploy prism_core only (prism_amm already deployed) ──────────────────────
echo ""
echo "=== Deploying prism_core ==="
cd "$CONTRACTS_DIR"
anchor program deploy \
  /mnt/d/prism-target/deploy/prism_core.so \
  --program-keypair /mnt/d/prism-target/deploy/prism_core-keypair.json \
  --provider.cluster devnet \
  --provider.wallet "$ADMIN_KEY"

echo ""
echo "=== Sync IDL to app ==="
cp "$TARGET_IDL_DIR/prism_core.json" "$APP_IDL_DIR/prism_core.json"
cp "$TARGET_IDL_DIR/prism_amm.json"  "$APP_IDL_DIR/prism_amm.json"
echo "IDL synced."

echo ""
echo "=== Verifying ==="
node -e "
const idl = require('$APP_IDL_DIR/prism_core.json');
console.log('prism_core:', idl.address);
console.log('instructions:', idl.instructions.map(i => i.name).join(', '));
"
