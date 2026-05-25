#!/bin/bash
export PATH="$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"
cd /mnt/c/Users/manov/Desktop/code/PRISM-Protocol/contracts

echo "Admin balance:"
solana balance qJnBaWcB2Yvd2MSf1s2XweMEd91RHgdG88ad8cAmbDK --url devnet

echo "Deploying programs..."
anchor program deploy --provider.cluster devnet
