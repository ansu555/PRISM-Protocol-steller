#!/bin/bash
set -e

MINT="${MINT:-CoSmAscHkm3KxFvsd3QvrLzzSX6Ke1qEfGvcWLPG1GJ1}"
echo "Using mint: $MINT"

transfer() {
  WALLET="$1"
  AMOUNT="$2"
  PUBKEY=$(solana-keygen pubkey "$WALLET")
  echo "Transferring $AMOUNT to $WALLET ($PUBKEY)..."
  spl-token transfer --fund-recipient --allow-unfunded-recipient "$MINT" "$AMOUNT" "$PUBKEY"
  echo "Done: $WALLET"
}

transfer keys/borrower.json 20000
transfer keys/lp_prime.json 10000
transfer keys/lp_core.json 5000
transfer keys/lp_alpha.json 5000
transfer keys/mm.json 5000

echo ""
echo "========================================"
echo "All wallets funded with test USDC"
echo "NEXT_PUBLIC_USDC_MINT=$MINT"
echo "========================================"
