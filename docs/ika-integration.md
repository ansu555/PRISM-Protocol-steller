# IKA Network Integration

This document outlines how the PRISM Protocol integrates with the IKA Network to provide decentralized collateral onboarding using threshold cryptography (MPC dWallets).

## Overview

PRISM uses IKA Network to allow borrowers to lock non-native collateral (like BTC or ETH) and receive loans on Solana. The integration consists of:
1. **dWallet Creation**: Creating a secure vault on the IKA Network.
2. **Attestation**: A decentralized oracle network (IKA Oracles) signing the state of the dWallet.
3. **On-chain Verification**: Solana smart contracts verifying the oracle signatures to release loans.

## Current Implementation (Testnet)

The current implementation in `app/lib/ika.ts` is hardened for the Sui Testnet environment.

### 1. Encryption Key Resolution
The IKA SDK often uses simulation to find a user's encryption key. Due to RPC instability on testnet, we implemented a **Direct Resolution** strategy:
- We dynamically resolve the `encryption_keys` table ID from the `DWalletCoordinator` object.
- We perform a direct `getDynamicFieldObject` lookup using the user's derived encryption address.
- This bypasses SDK-internal simulation failures and ensures reliable onboarding.

### 2. Transaction Bundling
Creating a dWallet requires a complex Sui transaction block:
1. **Session Registration**: Registering a unique UUID for the DKG (Distributed Key Generation) phase.
2. **DKG Request**: Submitting the public parameters and proofs for the MPC key generation.
3. **Object Cleanup**: Since Sui Programmable Transactions (PTB) require all created objects to be consumed or transferred, we explicitly transfer the resulting `DWalletCap` and any unused gas/fee coins back to the user's wallet.

### 3. Proxy Layer
To avoid CORS issues and handle RPC rate limiting, all Sui traffic is routed through `/api/sui-proxy`. This proxy includes:
- **Primary/Fallback Rotation**: Automatically switches between public RPC nodes if one fails.
- **Request Logging**: Full transparency into the JSON-RPC payloads for debugging.

## Mainnet Transition

When moving from Testnet to Mainnet, the following changes will be required:

### 1. Configuration Updates
Update `.env` variables to point to IKA Mainnet contracts:
- `NEXT_PUBLIC_IKA_NETWORK=mainnet`
- `NEXT_PUBLIC_IKA_FULLNODE_URL`: High-performance private RPC endpoint.
- `NEXT_PUBLIC_IKA_ORACLE_URL`: `https://oracle.ika.xyz/v1`

### 2. Fee Handling
On testnet, we currently split a nominal amount (1 MIST) from the gas object for both `paymentIka` and `paymentSui` arguments. 
- **Mainnet Requirement**: The `paymentIka` argument must be a real `Coin<IKA>` with sufficient balance. The UI should check for IKA token balance before initiating DKG.

### 3. Security Hardening
- **Root Seed Protection**: Ensure the root seed for encryption keys is derived from a secure source (e.g., wallet signature) and never stored in plain text.
- **DKG Verification**: Implement additional client-side verification of the generated public key before allowing the user to deposit large amounts of collateral.

## Troubleshooting

- **TypeMismatch (arg_idx: 10)**: Ensure `paymentIka` is an object of type `Coin<IKA>`. On testnet, a zero-coin placeholder of the correct type is used if the user has no IKA tokens.
- **UnusedValueWithoutDrop**: Occurs if the `DWalletCap` returned by the contract isn't transferred back to the user.
- **InvalidResultArity**: Occurs when trying to transfer the entire result object of a multi-return Move function. Always use explicit indexing (e.g., `result[0]`).
