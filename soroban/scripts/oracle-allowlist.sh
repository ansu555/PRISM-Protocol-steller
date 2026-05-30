#!/usr/bin/env bash
# Manage PRISM oracle allowlist on Soroban.
#
# Examples:
#   bash soroban/scripts/oracle-allowlist.sh check  0xabc...
#   bash soroban/scripts/oracle-allowlist.sh add    0xabc...
#   bash soroban/scripts/oracle-allowlist.sh remove 0xabc...
#   bash soroban/scripts/oracle-allowlist.sh rotate 0xold... 0xnew...
#
# Required env:
#   PRISM_CORE_CONTRACT_ID  (or soroban/deployments/testnet.json present)
# Optional env:
#   STELLAR_NETWORK (default: testnet)
#   STELLAR_SOURCE  (default: prism-admin)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEPLOYMENTS_FILE="$REPO_ROOT/soroban/deployments/testnet.json"

ACTION="${1:-}"
ORACLE_KEY="${2:-}"
NEW_ORACLE_KEY="${3:-}"

if [[ -z "$ACTION" ]]; then
  echo "Usage: $0 <check|add|remove|rotate> <oracle_pubkey_hex> [new_oracle_pubkey_hex]" >&2
  exit 1
fi

NETWORK="${STELLAR_NETWORK:-testnet}"
SOURCE="${STELLAR_SOURCE:-prism-admin}"

CONTRACT_ID="${PRISM_CORE_CONTRACT_ID:-}"
if [[ -z "$CONTRACT_ID" && -f "$DEPLOYMENTS_FILE" ]]; then
  if command -v jq >/dev/null 2>&1; then
    CONTRACT_ID="$(jq -r '.prism_core // empty' "$DEPLOYMENTS_FILE")"
  else
    CONTRACT_ID="$(grep -Eo '"prism_core"[[:space:]]*:[[:space:]]*"[^"]+"' "$DEPLOYMENTS_FILE" | sed -E 's/.*"([^"]+)"/\1/' || true)"
  fi
fi
if [[ -z "$CONTRACT_ID" ]]; then
  echo "Missing PRISM_CORE_CONTRACT_ID and no deployment file found at $DEPLOYMENTS_FILE" >&2
  exit 1
fi

invoke() {
  local fn="$1"
  shift
  stellar contract invoke \
    --id "$CONTRACT_ID" \
    --source "$SOURCE" \
    --network "$NETWORK" \
    -- "$fn" "$@"
}

case "$ACTION" in
  check)
    if [[ -z "$ORACLE_KEY" ]]; then
      echo "Missing oracle pubkey for check" >&2
      exit 1
    fi
    invoke is_oracle_allowlisted --oracle_pubkey "$ORACLE_KEY"
    ;;
  add)
    if [[ -z "$ORACLE_KEY" ]]; then
      echo "Missing oracle pubkey for add" >&2
      exit 1
    fi
    invoke add_oracle_to_allowlist --oracle_pubkey "$ORACLE_KEY"
    ;;
  remove)
    if [[ -z "$ORACLE_KEY" ]]; then
      echo "Missing oracle pubkey for remove" >&2
      exit 1
    fi
    invoke remove_oracle_from_allowlist --oracle_pubkey "$ORACLE_KEY"
    ;;
  rotate)
    if [[ -z "$ORACLE_KEY" || -z "$NEW_ORACLE_KEY" ]]; then
      echo "Usage: $0 rotate <old_oracle_pubkey_hex> <new_oracle_pubkey_hex>" >&2
      exit 1
    fi
    invoke rotate_oracle_allowlist_key \
      --old_oracle_pubkey "$ORACLE_KEY" \
      --new_oracle_pubkey "$NEW_ORACLE_KEY"
    ;;
  *)
    echo "Unknown action: $ACTION" >&2
    echo "Expected one of: check, add, remove, rotate" >&2
    exit 1
    ;;
esac
