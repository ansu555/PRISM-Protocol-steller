#!/usr/bin/env bash
# full-deploy.sh — build, deploy, and initialize prism-core on Stellar testnet.
#
# Performs a clean deploy:
#   1. Build WASM
#   2. Deploy test USDC SAC (PTUSDC:GCZF...) — admin can mint freely
#   3. Deploy prism_core
#   4. Deploy pToken SACs (pPRIME / pCORE / pALPHA) and set prism_core as admin
#   5. init_config + init_vault + init_tranche x3
#   6. update_admin → NEW_ADMIN
#   7. Write deployments/testnet.json

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SOROBAN_DIR="$REPO_ROOT/soroban"
DEPLOYMENTS_FILE="$SOROBAN_DIR/deployments/testnet.json"

SOURCE_KEY="prism-admin"
NETWORK="testnet"
NEW_ADMIN="${NEW_ADMIN:-GBF7XEKX6ZP7NYMS2IMFGAYVDZIZ66HHVLIAXAOPYFA5PF5Z6LI7PHMO}"
ADMIN_ADDR=$(stellar keys address "$SOURCE_KEY")

echo "════════════════════════════════════════════════════════"
echo "  PRISM Protocol — Full testnet deploy"
echo "════════════════════════════════════════════════════════"
echo "  Deployer  : $ADMIN_ADDR"
echo "  New admin : $NEW_ADMIN"
echo "  Network   : $NETWORK"
echo ""

# ── 1. Build ──────────────────────────────────────────────────────────────────
echo "==> Building prism-core WASM..."
cd "$SOROBAN_DIR"
stellar contract build --package prism-core 2>&1 | grep -E "Finished|error" || true
WASM="$SOROBAN_DIR/target/wasm32v1-none/release/prism_core.wasm"
WASM_SIZE=$(wc -c < "$WASM")
echo "    WASM: ${WASM_SIZE} bytes"

# ── 2. Deploy test USDC (PTUSDC) SAC ─────────────────────────────────────────
echo ""
echo "==> Deploying PTUSDC SAC..."
ASSET_CODE="PTUSDC"
ASSET="${ASSET_CODE}:${ADMIN_ADDR}"
USDC_SAC=$(stellar contract asset deploy \
  --asset "$ASSET" \
  --source "$SOURCE_KEY" \
  --network "$NETWORK" 2>/dev/null || true)

if [ -z "$USDC_SAC" ]; then
  # Already deployed — derive address
  USDC_SAC=$(stellar contract id asset \
    --asset "$ASSET" \
    --network "$NETWORK" 2>/dev/null)
fi
echo "    PTUSDC SAC: $USDC_SAC"

# ── 3. Deploy prism_core ───────────────────────────────────────────────────────
echo ""
echo "==> Deploying prism_core..."
CONTRACT_ID=$(stellar contract deploy \
  --wasm "$WASM" \
  --source "$SOURCE_KEY" \
  --network "$NETWORK" \
  2>/dev/null)
echo "    prism_core: $CONTRACT_ID"

# ── 4. Deploy pToken SACs and set prism_core as admin ─────────────────────────
echo ""
echo "==> Deploying pToken SACs..."

deploy_ptoken() {
  local code="$1"
  local asset="${code}:${ADMIN_ADDR}"
  local sac
  sac=$(stellar contract asset deploy \
    --asset "$asset" \
    --source "$SOURCE_KEY" \
    --network "$NETWORK" 2>/dev/null || true)
  if [ -z "$sac" ]; then
    sac=$(stellar contract id asset --asset "$asset" --network "$NETWORK" 2>/dev/null)
  fi
  echo "$sac"
}

PRIME_SAC=$(deploy_ptoken "PPRIME")
CORE_SAC=$(deploy_ptoken "PCORE")
ALPHA_SAC=$(deploy_ptoken "PALPHA")

echo "    pPRIME SAC: $PRIME_SAC"
echo "    pCORE  SAC: $CORE_SAC"
echo "    pALPHA SAC: $ALPHA_SAC"

echo ""
echo "==> Transferring pToken SAC admin → prism_core..."

for SAC in "$PRIME_SAC" "$CORE_SAC" "$ALPHA_SAC"; do
  stellar contract invoke \
    --id "$SAC" \
    --source "$SOURCE_KEY" \
    --network "$NETWORK" \
    -- set_admin \
    --new_admin "$CONTRACT_ID" 2>/dev/null && echo "    $SAC ✓" || echo "    $SAC (already set or skipped)"
done

# ── 5. Initialize prism_core ───────────────────────────────────────────────────
echo ""
echo "==> init_config..."
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source "$SOURCE_KEY" \
  --network "$NETWORK" \
  -- init_config \
  --admin "$ADMIN_ADDR" \
  --usdc_token "$USDC_SAC" \
  --default_yield_rate_bps 850 \
  --oracle_allowlist '[]'
echo "    ✓"

echo ""
echo "==> init_vault (vault_id=0)..."
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source "$SOURCE_KEY" \
  --network "$NETWORK" \
  -- init_vault \
  --vault_id 0
echo "    ✓"

echo ""
echo "==> init_tranche pPRIME (kind=0, apy=500bps=5%)..."
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source "$SOURCE_KEY" \
  --network "$NETWORK" \
  -- init_tranche \
  --vault_id 0 \
  --kind 0 \
  --target_apy_bps 500 \
  --ptoken "$PRIME_SAC"
echo "    ✓"

echo ""
echo "==> init_tranche pCORE (kind=1, apy=1000bps=10%)..."
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source "$SOURCE_KEY" \
  --network "$NETWORK" \
  -- init_tranche \
  --vault_id 0 \
  --kind 1 \
  --target_apy_bps 1000 \
  --ptoken "$CORE_SAC"
echo "    ✓"

echo ""
echo "==> init_tranche pALPHA (kind=2, apy=2500bps=25%)..."
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source "$SOURCE_KEY" \
  --network "$NETWORK" \
  -- init_tranche \
  --vault_id 0 \
  --kind 2 \
  --target_apy_bps 2500 \
  --ptoken "$ALPHA_SAC"
echo "    ✓"

# ── 6. Transfer prism_core admin → GBF7... ────────────────────────────────────
echo ""
echo "==> update_admin → $NEW_ADMIN..."
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source "$SOURCE_KEY" \
  --network "$NETWORK" \
  -- update_admin \
  --new_admin "$NEW_ADMIN"
echo "    ✓ Admin transferred"

# ── 7. Write deployment record ────────────────────────────────────────────────
DEPLOYED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
mkdir -p "$(dirname "$DEPLOYMENTS_FILE")"
cat > "$DEPLOYMENTS_FILE" <<EOF
{
  "network": "testnet",
  "prism_core": "$CONTRACT_ID",
  "usdc_sac": "$USDC_SAC",
  "usdc_asset": "${ASSET_CODE}:${ADMIN_ADDR}",
  "ptoken_prime": "$PRIME_SAC",
  "ptoken_core": "$CORE_SAC",
  "ptoken_alpha": "$ALPHA_SAC",
  "deployed_at": "$DEPLOYED_AT",
  "wasm_size_bytes": $WASM_SIZE,
  "admin_public_key": "$NEW_ADMIN",
  "deployer_key": "$ADMIN_ADDR"
}
EOF

echo ""
echo "════════════════════════════════════════════════════════"
echo "  Deployment complete!"
echo ""
echo "  prism_core : $CONTRACT_ID"
echo "  PTUSDC SAC : $USDC_SAC"
echo "  pPRIME SAC : $PRIME_SAC"
echo "  pCORE  SAC : $CORE_SAC"
echo "  pALPHA SAC : $ALPHA_SAC"
echo "  Admin      : $NEW_ADMIN (effective)"
echo "════════════════════════════════════════════════════════"
echo ""
echo "  Next: update NEXT_PUBLIC_PRISM_CORE_CONTRACT_ID and NEXT_PUBLIC_USDC_CONTRACT_ID"
echo "  in .env.local (or constants.ts defaults) to the values above."
echo ""
echo "  To mint PTUSDC to a demo address:"
echo "    stellar contract invoke --id $USDC_SAC --source $SOURCE_KEY --network testnet \\"
echo "      -- mint --to <ADDRESS> --amount 1000000000000  # 100,000 PTUSDC (7-dec)"
