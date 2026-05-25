#!/bin/bash
set -e
REPO="/mnt/c/Users/manov/Desktop/code/PRISM-Protocol"
cp "$REPO/contracts/target/idl/prism_core.json" "$REPO/app/lib/idl/prism_core.json"
cp "$REPO/contracts/target/idl/prism_amm.json"  "$REPO/app/lib/idl/prism_amm.json"
echo "IDLs synced."
