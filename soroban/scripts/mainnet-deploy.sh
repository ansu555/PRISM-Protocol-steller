#!/usr/bin/env bash
# mainnet-deploy.sh — build, deploy, and initialize prism-core on Stellar MAINNET.
#
# This is the production counterpart of full-deploy.sh. Key differences:
#   - Network is MAINNET (real XLM fees, irreversible).
#   - USDC is Circle's official mainnet SAC — NOT a mintable test token.
#   - pToken SACs are deployed fresh under the deployer's issuance (PPRIME/PCORE/PALPHA).
#   - oracle_allowlist starts EMPTY — add the production oracle key afterwards via
#     oracle-allowlist.sh. The demo oracle seeds must never be used on mainnet.
#   - Admin stays the deployer unless NEW_ADMIN is set (deployer is already the
#     intended admin in this project).
#
# Steps:
#   1. Build WASM
#   2. Deploy pToken SACs (pPRIME / pCORE / pALPHA), set prism_core as their admin
#   3. Deploy prism_core
#   4. init_config (real USDC, empty oracle allowlist) + init_vault + init_tranche x3
#   5. (optional) update_admin → NEW_ADMIN
#   6. Write deployments/mainnet.json
#
# Usage:
#   SOURCE_KEY=burner-deploy bash soroban/scripts/mainnet-deploy.sh
#
# Required env:
#   SOURCE_KEY   stellar CLI key alias used to sign (must be funded on mainnet)
# Optional env:
#   NEW_ADMIN    G-address to transfer admin to after init (default: deployer)
#   USDC_SAC     override the USDC contract id (default: Circle mainnet USDC)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SOROBAN_DIR="$REPO_ROOT/soroban"
DEPLOYMENTS_FILE="$SOROBAN_DIR/deployments/mainnet.json"

SOURCE_KEY="${SOURCE_KEY:?Set SOURCE_KEY to a funded mainnet CLI key alias}"
NETWORK="mainnet"

# Circle's official Stellar mainnet USDC Stellar Asset Contract.
# Derived from USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN, verified on-chain.
USDC_SAC="${USDC_SAC:-CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75}"

ADMIN_ADDR=$(stellar keys address "$SOURCE_KEY")
NEW_ADMIN="${NEW_ADMIN:-$ADMIN_ADDR}"

echo "════════════════════════════════════════════════════════"
echo "  PRISM Protocol — MAINNET deploy"
echo "════════════════════════════════════════════════════════"
echo "  Deployer  : $ADMIN_ADDR"
echo "  New admin : $NEW_ADMIN"
echo "  USDC SAC  : $USDC_SAC"
echo "  Network   : $NETWORK"
echo ""
echo "  ⚠️  This spends REAL XLM and is irreversible."
echo ""

# Safety gate — require explicit confirmation.
read -r -p "  Type 'DEPLOY MAINNET' to continue: " CONFIRM
if [ "$CONFIRM" != "DEPLOY MAINNET" ]; then
  echo "  Aborted." >&2
  exit 1
fi

# ── 1. Build ──────────────────────────────────────────────────────────────────
echo ""
echo "==> Building prism-core WASM..."
cd "$SOROBAN_DIR"
stellar contract build --package prism-core 2>&1 | grep -E "Finished|error" || true
WASM="$SOROBAN_DIR/target/wasm32v1-none/release/prism_core.wasm"
WASM_SIZE=$(wc -c < "$WASM")
echo "    WASM: ${WASM_SIZE} bytes"
if [ "$WASM_SIZE" -gt $((512 * 1024)) ]; then
  echo "ERROR: WASM exceeds 512 KB limit (${WASM_SIZE} bytes)" >&2
  exit 1
fi

# ── 2. Deploy pToken SACs ─────────────────────────────────────────────────────
echo ""
echo "==> Deploying pToken SACs (issuer = deployer)..."

deploy_sac() {
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

PRIME_SAC=$(deploy_sac "PPRIME")
CORE_SAC=$(deploy_sac "PCORE")
ALPHA_SAC=$(deploy_sac "PALPHA")

echo "    pPRIME SAC: $PRIME_SAC"
echo "    pCORE  SAC: $CORE_SAC"
echo "    pALPHA SAC: $ALPHA_SAC"

for sac in "$PRIME_SAC" "$CORE_SAC" "$ALPHA_SAC"; do
  if [ -z "$sac" ]; then echo "ERROR: a pToken SAC failed to deploy" >&2; exit 1; fi
done

# ── 3. Deploy prism_core ──────────────────────────────────────────────────────
echo ""
echo "==> Deploying prism_core..."
CONTRACT_ID=$(stellar contract deploy \
  --wasm "$WASM" \
  --source "$SOURCE_KEY" \
  --network "$NETWORK" 2>/dev/null)
if [ -z "$CONTRACT_ID" ]; then echo "ERROR: prism_core deploy returned empty id" >&2; exit 1; fi
echo "    prism_core: $CONTRACT_ID"

# ── 4. Transfer pToken SAC admin → prism_core ─────────────────────────────────
echo ""
echo "==> Transferring pToken SAC admin → prism_core..."
for SAC in "$PRIME_SAC" "$CORE_SAC" "$ALPHA_SAC"; do
  stellar contract invoke \
    --id "$SAC" --source "$SOURCE_KEY" --network "$NETWORK" \
    -- set_admin --new_admin "$CONTRACT_ID" >/dev/null 2>&1 \
    && echo "    $SAC ✓" || echo "    $SAC (already set or skipped)"
done

# ── 5. Initialize prism_core ──────────────────────────────────────────────────
echo ""
echo "==> init_config (USDC=$USDC_SAC, oracle_allowlist=[])..."
stellar contract invoke \
  --id "$CONTRACT_ID" --source "$SOURCE_KEY" --network "$NETWORK" \
  -- init_config \
  --admin "$ADMIN_ADDR" \
  --usdc_token "$USDC_SAC" \
  --default_yield_rate_bps 850 \
  --oracle_allowlist '[]'
echo "    ✓"

echo ""
echo "==> init_vault (vault_id=0)..."
stellar contract invoke \
  --id "$CONTRACT_ID" --source "$SOURCE_KEY" --network "$NETWORK" \
  -- init_vault --vault_id 0
echo "    ✓"

init_tranche() {
  local kind="$1" apy="$2" sac="$3" label="$4"
  echo ""
  echo "==> init_tranche $label (kind=$kind, apy=${apy}bps)..."
  stellar contract invoke \
    --id "$CONTRACT_ID" --source "$SOURCE_KEY" --network "$NETWORK" \
    -- init_tranche \
    --vault_id 0 --kind "$kind" --target_apy_bps "$apy" --ptoken "$sac"
  echo "    ✓"
}

init_tranche 0 500  "$PRIME_SAC" "pPRIME"
init_tranche 1 1000 "$CORE_SAC"  "pCORE"
init_tranche 2 2500 "$ALPHA_SAC" "pALPHA"

# ── 6. Optional admin transfer ────────────────────────────────────────────────
if [ "$NEW_ADMIN" != "$ADMIN_ADDR" ]; then
  echo ""
  echo "==> update_admin → $NEW_ADMIN..."
  stellar contract invoke \
    --id "$CONTRACT_ID" --source "$SOURCE_KEY" --network "$NETWORK" \
    -- update_admin --new_admin "$NEW_ADMIN"
  echo "    ✓ Admin transferred"
fi

# ── 7. Write deployment record ────────────────────────────────────────────────
DEPLOYED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
mkdir -p "$(dirname "$DEPLOYMENTS_FILE")"
cat > "$DEPLOYMENTS_FILE" <<EOF
{
  "network": "mainnet",
  "prism_core": "$CONTRACT_ID",
  "usdc_sac": "$USDC_SAC",
  "ptoken_prime": "$PRIME_SAC",
  "ptoken_core": "$CORE_SAC",
  "ptoken_alpha": "$ALPHA_SAC",
  "deployed_at": "$DEPLOYED_AT",
  "wasm_size_bytes": $WASM_SIZE,
  "admin_public_key": "$NEW_ADMIN",
  "deployer_key": "$ADMIN_ADDR",
  "oracle_allowlist": "EMPTY — add production key via oracle-allowlist.sh"
}
EOF

echo ""
echo "════════════════════════════════════════════════════════"
echo "  MAINNET deploy complete."
echo "════════════════════════════════════════════════════════"
echo ""
echo "  Set these in your production env:"
echo "    NEXT_PUBLIC_STELLAR_NETWORK=mainnet"
echo "    NEXT_PUBLIC_PRISM_CORE_MAINNET_ID=$CONTRACT_ID"
echo "    NEXT_PUBLIC_PTOKEN_PRIME_MAINNET_ID=$PRIME_SAC"
echo "    NEXT_PUBLIC_PTOKEN_CORE_MAINNET_ID=$CORE_SAC"
echo "    NEXT_PUBLIC_PTOKEN_ALPHA_MAINNET_ID=$ALPHA_SAC"
echo ""
echo "  Next steps:"
echo "    1. Add the production oracle key:  bash soroban/scripts/oracle-allowlist.sh"
echo "    2. Smoke-test:  stellar contract invoke --id $CONTRACT_ID --network mainnet -- get_config"
echo "    3. Written to:  $DEPLOYMENTS_FILE"
echo ""
echo "$CONTRACT_ID"
