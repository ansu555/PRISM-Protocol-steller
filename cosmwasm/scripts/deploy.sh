#!/usr/bin/env bash
# Build + deploy prism-core to XION testnet (xion-testnet-2).
#
# Prereqs:
#   - Docker (for cosmwasm/optimizer) OR `cargo` + wasm32 target
#   - xiond CLI installed and a funded key in the keyring (see KEY below)
#
# Usage:
#   bash cosmwasm/scripts/deploy.sh
#
# Output: code_id + contract address written to cosmwasm/deployments/testnet.json
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CW_DIR="$REPO_ROOT/cosmwasm"
DEPLOYMENTS_FILE="$CW_DIR/deployments/testnet.json"

# ── Config (override via env) ────────────────────────────────────────────────
CHAIN_ID="${XION_CHAIN_ID:-xion-testnet-2}"
NODE="${XION_RPC:-https://rpc.xion-testnet-2.burnt.com:443}"
KEY="${XION_KEY:-prism-admin}"          # name of the key in the xiond keyring
GAS_PRICES="${XION_GAS_PRICES:-0.025uxion}"
DENOM="uxion"

echo "==> Building optimized prism-core WASM..."
cd "$CW_DIR"
if command -v docker >/dev/null 2>&1; then
  docker run --rm -v "$CW_DIR":/code \
    --mount type=volume,source="prism_cache",target=/target \
    --mount type=volume,source=registry_cache,target=/usr/local/cargo/registry \
    cosmwasm/optimizer:0.16.0
  WASM="$CW_DIR/artifacts/prism_core.wasm"
else
  echo "    Docker not found — falling back to plain cargo release build."
  echo "    (For production, use cosmwasm/optimizer for a smaller, deterministic wasm.)"
  cargo build -p prism-core --target wasm32-unknown-unknown --release
  WASM="$CW_DIR/target/wasm32-unknown-unknown/release/prism_core.wasm"
fi

WASM_SIZE=$(wc -c < "$WASM")
echo "    WASM: $WASM (${WASM_SIZE} bytes)"

echo "==> cosmwasm-check (validates wasm exports)..."
if command -v cosmwasm-check >/dev/null 2>&1; then
  cosmwasm-check "$WASM"
else
  echo "    cosmwasm-check not installed — skipping (install: cargo install cosmwasm-check)"
fi

echo "==> Storing code on $CHAIN_ID..."
STORE_TX=$(xiond tx wasm store "$WASM" \
  --from "$KEY" --chain-id "$CHAIN_ID" --node "$NODE" \
  --gas auto --gas-adjustment 1.4 --gas-prices "$GAS_PRICES" \
  -y --output json)
STORE_HASH=$(echo "$STORE_TX" | jq -r '.txhash')
echo "    store txhash: $STORE_HASH"
sleep 6
CODE_ID=$(xiond query tx "$STORE_HASH" --node "$NODE" --output json \
  | jq -r '.events[] | select(.type=="store_code") | .attributes[] | select(.key=="code_id") | .value')
echo "    code_id: $CODE_ID"

echo "==> Instantiating prism-core..."
# USDC_TOKEN must be a cw20 contract address. For the demo, deploy a cw20-base
# test-USDC first (see README) and pass its address here.
USDC_TOKEN="${USDC_TOKEN:?Set USDC_TOKEN to the cw20 USDC contract address}"
ADMIN_ADDR="${ADMIN_ADDR:-$(xiond keys show "$KEY" -a)}"
# Oracle pubkeys (hex) — same Ed25519 keys as the Stellar build (unchanged signer).
ORACLE_ALLOWLIST_JSON="${ORACLE_ALLOWLIST_JSON:-[]}"

INIT_MSG=$(jq -nc \
  --arg admin "$ADMIN_ADDR" \
  --arg usdc "$USDC_TOKEN" \
  --argjson allow "$ORACLE_ALLOWLIST_JSON" \
  '{admin:$admin, usdc_token:$usdc, default_yield_rate_bps:500, oracle_allowlist:$allow}')

INST_TX=$(xiond tx wasm instantiate "$CODE_ID" "$INIT_MSG" \
  --from "$KEY" --label "prism-core" --admin "$ADMIN_ADDR" \
  --chain-id "$CHAIN_ID" --node "$NODE" \
  --gas auto --gas-adjustment 1.4 --gas-prices "$GAS_PRICES" \
  -y --output json)
INST_HASH=$(echo "$INST_TX" | jq -r '.txhash')
sleep 6
CONTRACT_ADDR=$(xiond query tx "$INST_HASH" --node "$NODE" --output json \
  | jq -r '.events[] | select(.type=="instantiate") | .attributes[] | select(.key=="_contract_address") | .value')
echo "    contract: $CONTRACT_ADDR"

mkdir -p "$(dirname "$DEPLOYMENTS_FILE")"
cat > "$DEPLOYMENTS_FILE" <<EOF
{
  "network": "$CHAIN_ID",
  "code_id": "$CODE_ID",
  "prism_core": "$CONTRACT_ADDR",
  "usdc_token": "$USDC_TOKEN",
  "admin": "$ADMIN_ADDR",
  "deployed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "wasm_size_bytes": $WASM_SIZE
}
EOF
echo "==> Written to $DEPLOYMENTS_FILE"
echo "$CONTRACT_ADDR"
