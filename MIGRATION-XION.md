# Stellar → XION migration — status & cutover guide

This tracks the in-progress migration of PRISM Protocol from Stellar/Soroban to
**XION** (Cosmos SDK / CosmWasm). The strategy is **additive**: the new XION
layer is built alongside the Stellar code so `pnpm build` keeps passing, then the
frontend is cut over file-by-file and the Stellar code deleted last.

See [the migration plan](.claude/plans/) for the full layer-by-layer analysis.

---

## ✅ Done (this pass)

### 1. CosmWasm contract — complete & tested
`cosmwasm/prism-core/` — full port of `soroban/prism-core`.
- All handlers ported: init/deposit/withdraw/accrue_yield/trigger_credit_event,
  loans, and the three Ed25519 oracle flows (Collateral / Encrypt / Cloak).
- **16 cw-multi-test tests pass**, including the byte-exact reference-card NAV
  parity tests (`p1_t4_waterfall…`, `p1_t5_cascade…` — CLAUDE.md hard rule #4)
  and `p3_t2_verify_collateral_full_round_trip`, which **proves the off-chain
  Ed25519 signer is byte-compatible** with `deps.api.ed25519_verify` (the plan's
  #1 risk — resolved).
- Release wasm builds (`cargo build --target wasm32-unknown-unknown --release`).
- Deploy tooling: `cosmwasm/scripts/deploy.sh` + `cosmwasm/README.md`.

Run it:
```bash
cd cosmwasm && cargo test -p prism-core
```

### 2. Frontend chain client — built
- `app/lib/xion.ts` — CosmWasm client mirroring the `getCoreClient` surface
  (`coreQuery` / `coreExecute`, cw20 helpers, allowance-aware `deposit`/
  `withdraw`/`repayLoan`, signer factories for the simulation harness).
- `app/lib/xion-addresses.ts` — XION network registry (parallel to `addresses.ts`).
- Deps installed: `@cosmjs/cosmwasm-stargate`, `@cosmjs/proto-signing`,
  `@cosmjs/stargate`, `@burnt-labs/abstraxion`.
- `tsc --noEmit` is clean; the existing Stellar build is untouched.

---

## 🔜 Remaining cutover (file-by-file)

Each step below is mechanical now that the contract + client exist. Do them in
order; `pnpm build` should stay green after each.

### A. Deploy + wire addresses
1. Deploy a cw20 test-USDC, then `bash cosmwasm/scripts/deploy.sh` (see
   `cosmwasm/README.md`). Deploy 3 pTokens (minter = prism-core), init vault +
   tranches.
2. Put the resulting `xion1…` ids in `.env.local`
   (`NEXT_PUBLIC_PRISM_CORE_CONTRACT_ID`, `NEXT_PUBLIC_USDC_CONTRACT_ID`,
   `NEXT_PUBLIC_PTOKEN_*`, `NEXT_PUBLIC_XION_RPC_URL`, `NEXT_PUBLIC_XION_CHAIN_ID`).

### B. Oracle signer routes — **near-zero change**
`app/api/{collateral,encrypt,cloak}-oracle/.../attest/route.ts` and
`app/lib/oracle-security.ts` keep their `node:crypto` Ed25519 signing **as-is**.
The contract verifies the same bytes. Only update doc comments / endpoint paths
if renamed. (Verified by the contract test.)

### C. Contract-invoking API routes → CosmJS
Rewrite these to use `app/lib/xion.ts` instead of `getCoreClient().invoke`:
- `app/api/admin/{initialize,mint-usdc,fund-identities,seed-pools,liquidate-collateral}/route.ts`
- `app/api/collateral/{attach,verify,release,reattest}/route.ts`
- `app/api/simulation/admin-action/route.ts`, `app/api/watcher/poll/route.ts`

Pattern: `Keypair.fromSecret(seed)` → `signerFromMnemonic(...)` /
`signerFromPrivateKeyHex(...)`; `core.invoke('verify_collateral', [scval…])` →
`coreExecute(signer, { verify_collateral: { loan_id, message, signature } })`
(message/signature are hex strings — already how the oracle route returns them).
`fund-identities`: Friendbot → XION faucet + cw20 mint; **delete trustline logic**.

### D. Hooks → CosmWasm calls
Rewrite the ~20 contract hooks to call `xion.ts` helpers. Shapes are preserved;
only the call site changes:
- `useVaultState.ts` — `core.read('get_vault', …)` → `coreQuery({ get_vault: { vault_id } })` (run all reads in `Promise.all` as today).
- `useDeposit` → `deposit(signer, …)` (allowance handled inside); **remove `useTrustlineCheck`/changeTrust**.
- `useWithdraw`/`useRepayLoan`/`useOriginateLoan`/`useDisburseLoan` → `coreExecute` / helpers.
- `useIdentity.tsx` — `Keypair.random()` → `randomSigner()`.

### E. Wallet provider → Abstraxion
Replace `components/providers/stellar-wallet-provider.tsx` with an
`AbstraxionProvider` (Meta Accounts, gasless via a Treasury contract) for the
real borrower flow; the simulation roles use the in-memory CosmJS signers from
`xion.ts`. **Note:** `@burnt-labs/abstraxion@1.0.0-alpha.79` declares a React 18
peer dep; this project is on React 19. It installs (peer warning only) but
verify the provider at runtime — if it misbehaves, either pin React for the
wallet subtree or keep the CosmJS-signer path as the primary demo flow until a
React-19-compatible Abstraxion release lands.

### F. External integrations
- **DEX** (`app/lib/soroswap.ts` → `app/lib/dex.ts`): deploy a minimal
  Astroport-style cw20 pair; swap UI calls `simulation`/`swap`; pool seeding
  stays admin-direct.
- **Oracle price** (`app/lib/reflector.ts` → `app/lib/pyth.ts`): Pyth read-only,
  or stub the price panel (collateral valuation is oracle-attestation driven, so
  protocol correctness is unaffected).
- **Fiat onramp** (`app/lib/moneygram.ts`): stub for the demo.
- **Horizon helpers** (`app/lib/horizon.ts`): balances via cw20 `balance` query +
  bank `uxion`; explorer URLs → a XION explorer.

### G. Config + DB + delete Stellar
- `app/lib/addresses.ts` + `constants.ts`: fold into the XION registry; drop
  `USDC_ASSET_CODE`/`USDC_ASSET_ISSUER`/`passphrase`.
- DB (`lib/loanStore.ts`, `lib/eventStore.ts`): **no schema change** — stored
  address/tx-hash strings just become `xion1…`; repurpose `network` to the chain id.
- Events indexer (`app/lib/onchain-indexer.ts`): Horizon REST → CometBFT
  `tx_search` on `wasm-*` events.
- Finally: remove `@stellar/stellar-sdk` + `@creit.tech/stellar-wallets-kit`,
  delete `app/lib/{stellar,trustline,horizon,soroswap,reflector,moneygram}.ts`
  and `soroban/`, then run the CLAUDE.md guard:
  `grep -r "@stellar\|@creit.tech\|soroban" app/ hooks/ components/` → must be empty.

---

## Verification checklist
1. `cd cosmwasm && cargo test -p prism-core` → 16 pass. ✅ (done)
2. Deploy to `xion-testnet-2`; `xiond query wasm contract-state smart $PRISM '{"get_config":{}}'`.
3. Tier-1 flow (hard rule #1): fund → deposit → accrue_yield → trigger_credit_event; assert reserve invariant via `useVaultState`.
4. Oracle path: collateral attach→verify using the **unchanged** signer route.
5. `pnpm build` green; Stellar-import guard empty.
