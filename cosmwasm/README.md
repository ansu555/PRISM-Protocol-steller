# PRISM Core — CosmWasm (XION) port

This is the XION/CosmWasm port of the PRISM Protocol credit engine, migrated from
`soroban/prism-core`. Same financial model — deposit/withdraw at NAV, the yield
waterfall (Prime → Core → Alpha), the reverse loss cascade (Alpha → Core →
Prime), loans, and the three Ed25519 oracle flows (Collateral / Encrypt / Cloak).

The **attestation byte layouts are unchanged**, so the existing off-chain oracle
signers (`app/api/*-oracle/.../attest`) are reused verbatim — `deps.api.ed25519_verify`
accepts the same 64-byte signatures. This is proven by the
`p3_t2_verify_collateral_full_round_trip` test.

## Layout

```
cosmwasm/
├── Cargo.toml              workspace
└── prism-core/
    └── src/
        ├── lib.rs          #[entry_point] instantiate / execute / query
        ├── contract.rs     all handler logic
        ├── msg.rs          InstantiateMsg / ExecuteMsg / QueryMsg
        ├── state.rs        structs + cw-storage-plus Item/Map
        ├── math.rs         Q64.64 fixed point (verbatim from Soroban)
        ├── error.rs        ContractError (thiserror)
        └── tests.rs        cw-multi-test suite (16 tests)
```

## Build & test

```bash
cd cosmwasm
cargo test -p prism-core                                   # 16 tests
cargo build -p prism-core --target wasm32-unknown-unknown --release
```

Reference-card NAV parity (§4.3 / §4.5) is asserted byte-exactly in
`p1_t4_waterfall_locked_demo_numbers` and `p1_t5_cascade_locked_demo_numbers`.

## What changed vs. Soroban

| Soroban | CosmWasm |
|---|---|
| `addr.require_auth()` | `info.sender` equality checks |
| `env.crypto().ed25519_verify` (panics) | `deps.api.ed25519_verify` (typed error) |
| SAC `token::Client` transfer/mint/burn | cw20 `Transfer`/`TransferFrom`/`Mint`/`BurnFrom` msgs |
| `env.ledger().timestamp()` | `env.block.time.seconds()` |
| `DataKey` enum + `extend_ttl` | `cw-storage-plus` Item/Map (no rent) |
| `BytesN<32/64>` | `HexBinary` (hex JSON) |
| `i128` amounts | `Uint128` |
| Soroswap cross-contract `seed_pool_liquidity` | removed — pool seeding is admin-direct via the frontend DEX client (matches existing workaround) |
| Reflector `read_reflector_price` | removed — price display moves to Pyth/stub in the frontend |

### Token model
- **USDC** and the three **pTokens** are `cw20-base` instances.
- prism-core is the **minter** of each pToken (set at cw20 instantiate).
- `deposit` / `withdraw` / `accrue_yield` / `repay_loan` use the cw20
  **allowance** model: the caller grants prism-core an allowance, the contract
  pulls via `TransferFrom` (or burns via `BurnFrom`). `disburse_loan` pays out
  from the contract's own balance via `Transfer`.

## Deploy (xion-testnet-2)

1. Install [`xiond`](https://docs.burnt.com) and fund a key:
   ```bash
   xiond keys add prism-admin
   # fund prism-admin from the XION faucet
   ```
2. Deploy a cw20 test-USDC (e.g. via the standard `cw20-base` code id on XION),
   note its address.
3. Run:
   ```bash
   USDC_TOKEN=xion1...your_cw20_usdc \
   ORACLE_ALLOWLIST_JSON='["<encrypt_oracle_pubkey_hex>","<cloak_oracle_pubkey_hex>"]' \
   bash cosmwasm/scripts/deploy.sh
   ```
4. Deploy three pTokens (cw20-base) with `minter = <prism_core address>`, then:
   ```bash
   xiond tx wasm execute $PRISM '{"init_vault":{"vault_id":0}}' --from prism-admin ...
   xiond tx wasm execute $PRISM '{"init_tranche":{"vault_id":0,"kind":0,"target_apy_bps":500,"ptoken":"xion1...pPrime"}}' ...
   # repeat kind=1 (core, 800), kind=2 (alpha, 1500)
   ```
5. Record `code_id` + `prism_core` (written to `deployments/testnet.json`) in the
   frontend's `app/lib/addresses.ts`.

## Read state

```bash
xiond query wasm contract-state smart $PRISM '{"get_config":{}}' --output json
xiond query wasm contract-state smart $PRISM '{"get_vault":{"vault_id":0}}' --output json
xiond query wasm contract-state smart $PRISM '{"get_tranche":{"vault_id":0,"kind":0}}' --output json
```
