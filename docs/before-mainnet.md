# Before Mainnet / Production Push

This file tracks every shortcut made for the devnet demo that must be replaced
before any real deployment. Each entry has: what it is, where it lives, and what
to do instead.

---

## 1. Admin keypair exposed client-side in AdminPanel

**File:** `components/admin/AdminPanel.tsx`

**What we did for demo:**
Imported `contracts/keys/admin.json` directly into the browser component and used
it to sign `initializeLoan` (and other admin transactions). This bypasses the need
for the admin to connect a Phantom wallet.

**Why it's wrong for production:**
The admin secret key is bundled into the frontend JS and visible to anyone who
inspects the browser. On mainnet this would allow anyone to drain the vault.

**What to do instead:**
- Remove the `adminSecret` import and `getAdminKeypair()` function.
- Restore the original `getPrograms()` that uses `useAnchorWallet()` (Phantom).
- The real admin imports their keypair into Phantom and connects it to `/admin`.
- All `initializeLoan` / `triggerCreditEvent` / `disburseLoan` calls sign via Phantom.

---

## 2. Simulation harness uses hardcoded demo keypairs

**Files:** `components/simulation/ActionPanel.tsx`, `hooks/useIdentity.tsx`

**What we did for demo:**
The dashboard simulation loads `admin.json`, `borrower.json`, `lpPrime.json`,
`lpCore.json`, `lpAlpha.json`, `mm.json` directly from `contracts/keys/` and signs
all on-chain transactions with them. No wallet connection needed.

**Why it's wrong for production:**
All six secret keys are bundled in the browser. Anyone can extract them and sign
arbitrary transactions with "admin" authority.

**What to do instead:**
Remove the simulation harness entirely from the production build (it is a demo
tool only), or gate it behind an authenticated admin session. Real LP deposits and
loan operations should go through Phantom.

---

## 3. Test oracle (`/api/ika-test-oracle`)

**File:** `app/api/ika-test-oracle/route.ts`
**Env var:** `NEXT_PUBLIC_IKA_ORACLE_URL=http://localhost:3000/api/ika-test-oracle`

**What we did for demo:**
A local API route signs IKA collateral attestations with a fixed devnet keypair.
It always returns `$50,000 USD` regardless of the actual collateral amount.
No real dWallet verification happens.

**What to do instead:**
- Point `NEXT_PUBLIC_IKA_ORACLE_URL` to the real IKA oracle endpoint.
- Remove or disable the `/api/ika-test-oracle` route in production.
- Verify the oracle pubkey in `.env` matches the real IKA oracle's signing key.

---

## 4. Hardcoded USDC mint (devnet Circle faucet mint)

**File:** `app/lib/constants.ts` — `USDC_MINT`
**Env var:** `NEXT_PUBLIC_USDC_MINT`

**What we did for demo:**
Using Circle's devnet USDC mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`
(not the real mainnet USDC).

**What to do instead:**
Set `NEXT_PUBLIC_USDC_MINT` to the mainnet USDC mint
`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` before deploying to mainnet.

---

## 5. Program IDs must be re-deployed to mainnet

**Files:** `Anchor.toml`, `.env.local`, `app/lib/constants.ts`

**What we did for demo:**
All program IDs (`PRISM_CORE_PROGRAM_ID`, `PRISM_AMM_PROGRAM_ID`) point to devnet
deployments. The upgrade authority is `admin.json` which is committed to the repo.

**What to do instead:**
- Generate new program keypairs with a hardware wallet as upgrade authority.
- Deploy to mainnet-beta.
- Update all program ID references.
- Rotate the upgrade authority to a multisig (e.g. Squads) immediately after deploy.
- Never commit mainnet keypairs to the repo.

---

## 6. `contracts/keys/` committed to repo

**What we did for demo:**
Six devnet keypairs are committed so the simulation harness can load them. The
docs explicitly mark these as "devnet only".

**What to do instead:**
Add `contracts/keys/` to `.gitignore` before mainnet work begins. Distribute keys
out-of-band (1Password, Vault, etc.).

---

## 7. IKA real dWallet creation untested

**File:** `app/lib/ika.ts` — `createIkaDwallet()`

**What we did for demo:**
The DKG flow is implemented but never run end-to-end because it requires funded
IKA testnet SUI tokens. The borrower flow always uses a manually typed dWallet ID.

**What to do instead:**
Fund an IKA testnet wallet and run the full DKG flow before launch. Confirm the
dWallet ID auto-fill works correctly in `CollateralOnboarding.tsx`.

---

## 8. Release collateral button not gated on loan repayment

**File:** `components/borrower/CollateralOnboarding.tsx`

**What we did for demo:**
The "Release Collateral" button is always visible when collateral status is
`Locked`. The on-chain instruction correctly checks `loan.state == Repaid` but the
UI does not fetch or check loan state before showing the button.

**What to do instead:**
Fetch the `Loan` account via `useVaultState` or a dedicated hook, and only show
the Release button when `loan.state == Repaid`.

---

## 9. No in-app USDC faucet

**What we did for demo:**
Devnet USDC must be minted via CLI. There is no in-app faucet button.

**What to do instead (mainnet):**
Users acquire real USDC from exchanges. Remove any faucet references in the UI.
For future devnet testing, add a `/faucet` admin-only endpoint that calls
`spl-token mint`.

---

## 10. Liquidation UI missing

**File:** `components/admin/AdminPanel.tsx`

**What we did for demo:**
`liquidate_ika_collateral` exists on-chain but there is no button in the admin
panel to call it.

**What to do instead:**
Add a "Liquidate Collateral" button in the admin panel, gated behind a loan
default state check, before going live.

---

## Quick checklist before any real deployment

- [ ] Remove `adminSecret` import from `AdminPanel.tsx`, restore Phantom signing
- [ ] Remove or gate the simulation harness (ActionPanel + useIdentity keypairs)
- [ ] Disable `/api/ika-test-oracle`, point env to real IKA oracle
- [ ] Update USDC mint to mainnet address
- [ ] Deploy programs to mainnet with hardware-wallet upgrade authority
- [ ] Add `contracts/keys/` to `.gitignore`
- [ ] Test real dWallet DKG end-to-end on IKA testnet
- [ ] Gate Release Collateral button on `loan.state == Repaid`
- [ ] Add liquidation UI in admin panel
- [ ] Audit the contract with a third party before real funds

