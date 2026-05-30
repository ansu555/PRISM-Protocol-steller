#!/usr/bin/env bash
# update-admin.sh — transfer prism_core admin rights to a new Stellar address.
#
# Prerequisites:
#   1. Rebuild and redeploy the contract after adding the update_admin function:
#        cd soroban && cargo build --target wasm32-unknown-unknown --release
#        stellar contract deploy --wasm target/wasm32-unknown-unknown/release/prism_core.wasm \
#          --source <current-admin-secret-key> --network testnet
#   2. Re-run init_config with the new contract address if redeploying from scratch.
#
# If the deployed contract already has update_admin (after this patch is applied
# and deployed), run this script directly to transfer admin:
#
#   CURRENT_ADMIN_SECRET=S... NEW_ADMIN=GBF7... bash soroban/scripts/update-admin.sh

set -euo pipefail

NETWORK="${STELLAR_NETWORK:-testnet}"
CONTRACT_ID="${PRISM_CORE_CONTRACT_ID:-CC3MUXPI5D5NHX7SAA4HYLG6NPTCJH5OBXGF6O3O7QFV6CZWQ33KY7FV}"
NEW_ADMIN="${NEW_ADMIN:-GBF7XEKX6ZP7NYMS2IMFGAYVDZIZ66HHVLIAXAOPYFA5PF5Z6LI7PHMO}"

if [[ -z "${CURRENT_ADMIN_SECRET:-}" ]]; then
  echo "ERROR: set CURRENT_ADMIN_SECRET to the current admin's secret key (S...)" >&2
  exit 1
fi

echo "Transferring admin for contract $CONTRACT_ID"
echo "  → New admin: $NEW_ADMIN"
echo "  → Network:   $NETWORK"
echo ""

stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source "$CURRENT_ADMIN_SECRET" \
  --network "$NETWORK" \
  -- update_admin \
  --new_admin "$NEW_ADMIN"

echo ""
echo "Admin transfer submitted. Verify with:"
echo "  stellar contract invoke --id $CONTRACT_ID --network $NETWORK -- get_config"
