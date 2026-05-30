#!/usr/bin/env bash
# Deploy prism-core to Stellar testnet.
# Usage: bash soroban/scripts/deploy.sh
# Output: contract ID printed to stdout and written to soroban/deployments/testnet.json

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SOROBAN_DIR="$REPO_ROOT/soroban"
DEPLOYMENTS_FILE="$SOROBAN_DIR/deployments/testnet.json"

echo "==> Building prism-core WASM..."
cd "$SOROBAN_DIR"
# stellar contract build uses wasm32v1-none (no reference-types) required by Soroban
stellar contract build --package prism-core 2>&1 | grep -E "^(error|warning:|Compiling|Finished|ℹ️|✅)" || true

WASM="$SOROBAN_DIR/target/wasm32v1-none/release/prism_core.wasm"
WASM_SIZE=$(wc -c < "$WASM")
echo "    WASM size: ${WASM_SIZE} bytes"
if [ "$WASM_SIZE" -gt $((512 * 1024)) ]; then
  echo "ERROR: WASM exceeds 512 KB limit (${WASM_SIZE} bytes)" >&2
  exit 1
fi

echo "==> Deploying to testnet..."
CONTRACT_ID=$(stellar contract deploy \
  --wasm "$WASM" \
  --source prism-admin \
  --network testnet \
  2>/dev/null)

if [ -z "$CONTRACT_ID" ]; then
  echo "ERROR: Deploy returned empty contract ID" >&2
  exit 1
fi

echo "    Contract ID: $CONTRACT_ID"

mkdir -p "$(dirname "$DEPLOYMENTS_FILE")"
cat > "$DEPLOYMENTS_FILE" <<EOF
{
  "network": "testnet",
  "prism_core": "$CONTRACT_ID",
  "deployed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "wasm_size_bytes": $WASM_SIZE
}
EOF

echo "==> Written to $DEPLOYMENTS_FILE"
echo "$CONTRACT_ID"
