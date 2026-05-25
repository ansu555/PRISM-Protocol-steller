# IKA Frontend Test Plan — Devnet

Walk this list to manually exercise the entire IKA collateral flow against the
deployed devnet programs. Two prerequisites assumed:

- Phantom set to **Devnet**
- The dev server is running (`pnpm dev` → http://localhost:3000)

If you don't have a dev server running, start one. The user already has one
on port 3000.

---

## 0. Sanity checks (do these once)

### 0a. Test oracle is reachable

```bash
curl -s -X POST http://localhost:3000/api/ika-test-oracle/attest \
  -H "Content-Type: application/json" \
  -d '{"dwallet_id":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","chain_id":0,"loan_pubkey":"11111111111111111111111111111111"}'
```

Expected:
```json
{"signature":"...","oracle_pubkey":"5nmEq5cNc9yXpK1ySrb4XH65zccBvRK2hwKnEJePjcrf","amount_usd_micro":"50000000000"}
```

If you get 404: the route move didn't take effect. Restart `pnpm dev`.

### 0b. On-chain config exists for the deployed program

Open http://localhost:3000/admin and click **Run Full Setup**. It is idempotent —
if the GlobalConfig is already initialized it skips. If you see any error other
than "already exists", stop and read the toast message.

---

## 1. Borrow flow

### 1a. Submit a loan application
1. Open http://localhost:3000/borrower
2. Connect Phantom (any wallet — this is the *borrower* wallet)
3. Step 1 form: amount `5000`, duration `30 days`, purpose `test`
4. Click **Submit Loan Application** → status badge should flip to **Under Review**

### 1b. Approve and originate (admin)
1. Open http://localhost:3000/admin
2. Phantom does NOT need to be the admin — `AdminPanel` signs with the local
   `admin.json` keypair (this is a demo shortcut documented in
   `docs/before-mainnet.md` §1).
3. Section 4 "Pending Loan Applications" → click **Approve & Originate** next to
   the application.
4. The toast should say "Loan #N originated". The localStorage record now has
   `loanId` attached.

### 1c. Confirm Step 2 (collateral) appears
1. Back to http://localhost:3000/borrower
2. The page now shows **Step 2: Lock Collateral via IKA dWallet**

---

## 2. IKA collateral flow

This is the core of the audit.

### 2a. Attach collateral
1. In the collateral form:
   - **Chain:** Bitcoin
   - **dWallet ID:** `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` (64 hex)
   - **Collateral Value (USD):** `10000`
   - **Oracle Public Key:** click the gray text "5nmEq5cNc9yXp…" to autofill
2. Click **Register IKA Collateral**
3. Phantom asks to sign one tx (`attach_ika_collateral`). Sign it.
4. The form should disappear and a status panel should show:
   - **Status:** Pending (yellow)
   - dWallet ID, Chain, Collateral, Oracle fields populated

### 2b. Verify collateral lock (the critical bit)
1. Click **Verify Collateral Lock**
2. Toast: "Waiting for IKA oracle attestation…"
3. The frontend POSTs to `/api/ika-test-oracle/attest`, gets back an ed25519
   signature, then builds a 2-instruction Solana tx:
   - ix[0] — native ed25519 precompile validates the oracle sig
   - ix[1] — `verify_ika_collateral` reads ix[0] via the instructions sysvar
4. Phantom asks to sign the combined tx. Sign it.
5. Status badge flips to **Locked** (green).
6. The Collateral USD field updates to `$50,000.00` (oracle's attested amount,
   which overrides the registered $10k — this is by design).

**If this step fails:**
- "IKA oracle did not confirm lock within 300s" → oracle URL bug returned;
  re-check 0a above.
- "OracleSignatureInvalid" → oracle key mismatch. Make sure the prefilled key
  is `5nmEq5cNc9yXpK1ySrb4XH65zccBvRK2hwKnEJePjcrf`.
- "InsufficientCollateral" → registered USD > oracle's $50k. Re-attach with
  ≤ 50000.

### 2c. Disburse loan (admin)
1. Open `/admin`, scroll to **Section 3: Simulate Events**
2. Click **Disburse Loan**
3. The borrower should receive their loan principal (5000 USDC) — but only if
   the vault reserve actually has that much USDC. If not, see §3 below.

### 2d. Repay loan (admin/borrower)
1. Click **Repay Loan** in `/admin`. (The simulation harness uses the local
   `borrower.json` keypair; the on-chain Phantom wallet does not need to
   participate.)
2. Loan state → Repaid.

### 2e. Release collateral (borrower)
1. Back to `/borrower`. The collateral panel should now show a
   **Release Collateral** button (gated on `loan.state == Repaid`).
2. Click it. Phantom asks to sign `release_ika_collateral`.
3. Status flips to **Released** (blue).

---

## 3. Funding the vault for §2c

If the vault has no USDC, `Disburse Loan` will fail with InsufficientLiquidity
or similar. To seed the vault on devnet:

```bash
# Get devnet USDC for the LP keypair
solana airdrop 2 $(solana address -k contracts/keys/lp_prime.json) --url devnet

# Mint USDC into the LP wallet (you need mint authority — admin.json holds it
# for the dev USDC mint set in .env.local)
spl-token mint $NEXT_PUBLIC_USDC_MINT 50000 \
  --owner contracts/keys/admin.json \
  $(spl-token address --owner $(solana address -k contracts/keys/lp_prime.json) \
    --token $NEXT_PUBLIC_USDC_MINT --verbose | head -1)
```

Then in `/admin` → Section 2 → click **Deposit 5000 USDC into Prime**.

Alternatively, skip §2c and confirm §2a + §2b only — they are the IKA-specific
parts and the rest is just standard prism-core flow already covered by tests.

---

## 4. What "passing" means

You have validated the IKA implementation end-to-end if all of the following
are true after this walkthrough:

- ✅ §2a: `attach_ika_collateral` PDA exists with status=Pending
- ✅ §2b: ed25519 + verify tx confirmed; status=Locked; USD updated to $50k
- ✅ §2e: `release_ika_collateral` flips status to Released

If §2a and §2b are green you have proven the contract integration works on
devnet — the rest is standard credit-engine machinery, which is covered by
the localnet test suite.

---

## 5. Items I still can't verify without your input

- **Real IKA dWallet creation** (§13.4 of `contract-integration-progress.md`):
  needs you to fund a Sui keypair on IKA testnet with SUI + IKA tokens. The
  code path is in `app/lib/ika.ts:createIkaDwallet` — it calls
  `prepareDKGAsync` (WASM in-browser) and submits the Sui tx. Untested.

- **Real IKA oracle**: change `NEXT_PUBLIC_IKA_ORACLE_URL` in `.env.local`
  from `http://localhost:3000/api/ika-test-oracle` to the real oracle.
  No code changes needed; the polling and 404-retry logic in
  `pollOracleAttestation` already handles the "wait for lock confirmation"
  case.

- **Liquidation UI** (§13.7): `liquidate_ika_collateral` exists on-chain but no
  admin button calls it. If you want me to add this, say so.
