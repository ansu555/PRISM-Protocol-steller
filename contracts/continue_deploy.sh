#!/usr/bin/env bash
set -e

[ -f "$HOME/.cargo/env" ] && source "$HOME/.cargo/env"
export PATH="$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"

CONTRACTS_DIR="/mnt/c/Users/manov/Desktop/code/PRISM-Protocol/contracts"
APP_DIR="/mnt/c/Users/manov/Desktop/code/PRISM-Protocol/app"
TARGET_DIR="/mnt/d/prism-target"
ADMIN_KEY="$CONTRACTS_DIR/keys/admin.json"
CORE_KP="$CONTRACTS_DIR/keys/prism_core_new.json"
AMM_KP="$CONTRACTS_DIR/keys/prism_amm_new.json"

CORE_ID=$(solana-keygen pubkey "$CORE_KP")
AMM_ID=$(solana-keygen pubkey "$AMM_KP")
echo "prism_core: $CORE_ID"
echo "prism_amm:  $AMM_ID"

echo ""
echo "=== Checking admin balance ==="
ADMIN_PUBKEY=$(solana-keygen pubkey "$ADMIN_KEY")
solana balance "$ADMIN_PUBKEY" --url devnet

echo ""
echo "=== Deploying prism_core ==="
solana program deploy "$TARGET_DIR/deploy/prism_core.so" \
  --keypair "$ADMIN_KEY" \
  --program-id "$CORE_KP" \
  --url devnet

echo ""
echo "=== Deploying prism_amm ==="
solana program deploy "$TARGET_DIR/deploy/prism_amm.so" \
  --keypair "$ADMIN_KEY" \
  --program-id "$AMM_KP" \
  --url devnet

echo ""
echo "=== Syncing IDL files ==="
cp "$TARGET_DIR/idl/prism_core.json" "$APP_DIR/lib/idl/prism_core.json"
cp "$TARGET_DIR/idl/prism_amm.json"  "$APP_DIR/lib/idl/prism_amm.json"
echo "IDL synced."

echo ""
echo "=== Updating constants.ts ==="
OLD_CORE="E3g9dfc7Azz9MZcM9vJPeWA8JKN3rrU7k35KBm5chcL6"
OLD_AMM="4y3iZE8WSAJyMrUgnSCDmqzVQru63UF9YU5L74EaUJY3"
sed -i "s/$OLD_CORE/$CORE_ID/g" "$APP_DIR/lib/constants.ts"
sed -i "s/$OLD_AMM/$AMM_ID/g"   "$APP_DIR/lib/constants.ts"
echo "constants.ts updated."

echo ""
echo "=== Updating .env.local ==="
ENV_FILE="/mnt/c/Users/manov/Desktop/code/PRISM-Protocol/.env.local"
sed -i "s/NEXT_PUBLIC_PRISM_CORE_PROGRAM_ID=.*/NEXT_PUBLIC_PRISM_CORE_PROGRAM_ID=$CORE_ID/" "$ENV_FILE"
sed -i "s/NEXT_PUBLIC_PRISM_AMM_PROGRAM_ID=.*/NEXT_PUBLIC_PRISM_AMM_PROGRAM_ID=$AMM_ID/" "$ENV_FILE"
echo ".env.local updated."

echo ""
echo "=== DONE ==="
echo "prism_core: $CORE_ID"
echo "prism_amm:  $AMM_ID"
echo ""
echo "Next steps:"
echo "  1. Restart dev server (bun dev)"
echo "  2. Open /admin, connect Phantom wallet, click Run Full Setup"
