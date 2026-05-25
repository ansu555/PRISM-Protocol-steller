#!/bin/bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
cd /mnt/c/Users/manov/Desktop/code/PRISM-Protocol/contracts
for f in keys/*.json; do
  echo -n "$f: "
  solana balance -k "$f" --url devnet
done
