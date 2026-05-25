# PRISM Protocol — Demo Recording Runbook

**When you use this:** Day 15 (May 10, 2026) — recording the 2:30 demo video for submission.

**Goal:** Capture a single take of the locked demo arc (per [04-data-flows.md §4.1](04-data-flows.md)) cleanly, with no fumbles, in a way that can be uploaded to Frontier on Day 16.

This is operational. Not architecture. Print it out, tape it to your monitor, follow it like a checklist.

---

## 1. Pre-flight (Day 14 evening — do not skip)

Run all of this the night before recording. Catching a problem at 11pm Day 14 is much better than 2pm Day 15.

### 1.1 Devnet state

```bash
# Verify devnet programs still deployed (devnet sometimes wipes state)
solana program show <PRISM_CORE_PROGRAM_ID> --url devnet
solana program show <PRISM_AMM_PROGRAM_ID> --url devnet
# Both should return "Authority: ... Last deployed: ..." — not "Account Not Found"
```

If either is missing, **redeploy**:
```bash
anchor deploy --provider.cluster devnet
```

### 1.2 Wallet balances

```bash
for wallet in admin borrower lp_prime lp_core lp_alpha mm; do
  echo "$wallet:"
  solana balance -k keys/$wallet.json --url devnet
done
```

Expected (per [12-reference-card.md §5](12-reference-card.md)):
- `admin`: ≥3 SOL
- All others: ≥0.5 SOL

If short, airdrop (`solana airdrop ...`).

USDC: visit https://faucet.circle.com on devnet for each wallet, top up per [12-reference-card.md §1.5](12-reference-card.md). Devnet faucet has rate limits — you may need to spread it across an hour.

### 1.3 Setup script — fresh demo state

```bash
# Use vault_id = 1 for the recording (vault 0 might have leftover state from testing)
yarn setup --vault-id 1
# Update app/.env.local: NEXT_PUBLIC_VAULT_ID=1
```

Verify summary print at the end matches [11-setup-demo-script.md §13](11-setup-demo-script.md). NAVs should read:
- Prime: 1.00411
- Core:   1.00987
- Alpha: 1.00290

### 1.4 Frontend smoke test

```bash
cd app && yarn dev
```

Open http://localhost:3000/dashboard. Verify:
- [ ] Three tranche bars render with correct NAVs
- [ ] Connect wallet works (try with each demo wallet via Phantom's "import key" feature)
- [ ] Deposit form is reachable
- [ ] Trade page loads with AMM pool data
- [ ] Admin page shows Trigger Default + Run Market Reaction buttons
- [ ] Click "Trigger Default" → cascade animation plays for ~8 seconds → Before/After panel slides in → User PnL panel appears
- [ ] Click "Run Market Reaction" → 5 Alpha sells walk pALPHA price 1.00 → ~0.11; 2 Core sells walk pCORE → ~0.44

If any check fails, **fix tonight, not tomorrow**.

### 1.5 Reset for recording

After smoke test, the demo state is "consumed" (default has fired). Reset for clean recording:

```bash
yarn setup --vault-id 2     # next clean vault
# Update app/.env.local: NEXT_PUBLIC_VAULT_ID=2
# Restart yarn dev
```

Now vault 2 is the recording vault. NAVs back to post-yield state, ready for default.

### 1.6 Recording setup

- **Software:** OBS Studio (free)
- **Resolution:** 1920×1080 @ 30fps
- **Audio:** USB mic + headphones (no echo). Test with `arecord -d 5 test.wav && aplay test.wav` on Linux, or QuickTime audio test on macOS.
- **Browser:** Chrome with only the demo tab open. No bookmarks bar. No extensions visible (or use Incognito with Phantom installed).
- **Background music:** None. Voice + UI sounds only.
- **Phantom:** logged in to `lp_prime` wallet first (it's the first to deposit in the demo). Have other demo wallet keys ready in a paste-able list for fast switching.

Phantom wallet switching during the demo is tricky. Two options:
- **(A) Import all 6 wallet keys into Phantom** ahead of time. Switch via Phantom's account dropdown during the demo.
- **(B) Use 6 separate browser profiles or Phantom installs**, one per wallet. Visually slower but no fumble risk.

**My pick: A** — practiced 5 times in dry-run, smooth. Use B only if you keep mis-clicking accounts in dry-run.

### 1.7 Dry runs

**Run the demo three times before recording.** Each dry run, time it. Target: 2:25–2:30. If you're hitting 2:40+, identify which segment is slow and tighten it.

Common slow spots:
- Wallet switching in Phantom (~3 sec each — minimize by pre-loading the right wallet for each segment)
- Transaction confirmation lag (devnet sometimes 5+ sec — accept it, don't apologize on camera)
- Reading the script verbatim (sound stiff — aim for "casual but precise")

---

## 2. Recording day (Day 15) — pre-record checklist

| Check | Done |
|---|---|
| Computer plugged in (no battery dropout mid-take) | ☐ |
| Wifi reliable (or hardwired) — devnet RPC needs network | ☐ |
| Helius API key in `.env.local` is hot (not rate-limited) | ☐ |
| Phantom unlocked, demo wallets imported | ☐ |
| Slack / Discord / mail muted (no notification dings on recording) | ☐ |
| Phone on Do Not Disturb | ☐ |
| OBS recording configured: 1920×1080, 30fps, mp4 output | ☐ |
| OBS sources: Browser (only) — no desktop, no terminal | ☐ |
| Mic test recorded — voice clear, no clipping | ☐ |
| Browser zoom = 100% (Cmd+0 / Ctrl+0) | ☐ |
| `yarn setup --vault-id 3` ran successfully — fresh state for recording | ☐ |
| `app/.env.local` has `NEXT_PUBLIC_VAULT_ID=3` | ☐ |
| `yarn dev` running, http://localhost:3000/dashboard rendering correctly | ☐ |
| Three tranche bars at correct post-yield NAVs (1.00411 / 1.00987 / 1.00290) | ☐ |
| Phantom on devnet (settings → developer mode → cluster=devnet) | ☐ |
| Phantom wallet currently selected: `admin` (will switch during demo) | ☐ |

---

## 3. The take — second-by-second script

**Total target: 2:25–2:30.** If you go over by more than 10s, redo.

Each phase below has the **action** (what you do on screen) and the **say** (voiceover). Don't read the say verbatim — paraphrase naturally. The only lines to deliver word-for-word are marked **★ EXACT**.

### Phase 1 — Setup (0:00 → 0:10)

**Action:**
- Land on `/dashboard`. Three tranche bars visible. No wallet connected.
- Cursor hover over the three NAV labels.

**Say:**
> *"This is PRISM — a credit vault on Solana with three risk tranches: Prime, Core, Alpha. Each one has a different risk profile, and a different yield."*

### Phase 2 — Deposit (0:10 → 0:30)

**Action:**
- Click "Connect Wallet" → select `lp_prime` from Phantom dropdown → connect.
- Navigate to `/deposit`.
- Click "Strategy preset: Balanced" → confirm in Phantom (one tx, three deposits batched).
- Wait ~3 sec for confirmation toast.
- Navigate back to `/dashboard`.

**Say:**
> *"A user can deposit USDC into any tranche — or use a strategy preset. This is the 'Balanced' allocation: 50% Prime, 30% Core, 20% Alpha. Their position is now three SPL tokens — pPRIME, pCORE, pALPHA — that represent their share of each tranche."*

### Phase 3 — Yield Accrual (0:30 → 0:50)

**Action:**
- Switch Phantom to `admin` wallet (Phantom dropdown → admin).
- Navigate to `/admin`.
- Click "Accrue Yield" → confirm in Phantom.
- Wait for confirmation. Dashboard NAV bars tick UP simultaneously (animation per [04-data-flows.md §4.3](04-data-flows.md)).
- Linger 2 sec on the NAV bars.

**Say:**
> *"The borrower pays a coupon — 100 USDC over 30 days. Watch the waterfall."*
> [pause for animation]
> *"Prime targets 5%, Core targets 8%, and Alpha targets 15%. Yield flows through that priority order."*

### Phase 4 — Trade #1 (0:50 → 1:05)

**Action:**
- Switch Phantom to `lp_prime`.
- Navigate to `/trade`.
- Select "pPRIME → USDC", enter `50`, click "Swap" → confirm.
- Price chart updates: 1.000 → 0.980. Annotation: "Market: 0.980 · NAV: 1.00411 · Discount: 2.4%".

**Say:**
> *"Tranche tokens trade on a constant-product AMM. Selling 50 pPRIME returns 49.5 USDC — that's a 2.4% discount to the underlying NAV. The market is pricing risk premium organically."*

### Phase 5 — DEFAULT MOMENT (1:05 → 1:45) ★ THE 40-SECOND HERO

**Action:**
- Switch Phantom to `admin`.
- Navigate to `/admin`.
- Hover over "Trigger Default (Switchboard)" — pause 2 seconds for visual emphasis.
- Click → confirm in Phantom.
- **Stop talking.** Watch the cascade animation play for ~8 seconds:
  - Frame 0: steady NAVs
  - Frame 1: red "DEFAULT" banner flashes
  - Frame 2: Alpha bar drains to zero (animated)
  - Frame 3: Core bar drops ~32%
  - Frame 4: Prime pulses green "PROTECTED"
  - Frame 5: Before/After panel slides in
  - Frame 6: User PnL panel appears with countup numbers

**Say (during animation):**
> *"Watch the Alpha tranche."* [pause]
> *"Then the Core."* [pause]
> *"The Prime holders are protected — exactly as the contract promised."*

[Cascade completes. PnL panel populates: User A +$20.55, User B -$960.60, User C -$2,000.]

**★ EXACT line, then 3-second pause:**
> *"This is what real credit risk looks like — losses don't disappear, they move."*
> [silence ~3 seconds, let the panel land]

### Phase 6 — Trade #2: Market Reprices (1:45 → 2:05) ★ THE NEW PEAK

**Action:**
- Still on `/admin` as `admin` wallet.
- Click "Run Market Reaction" → confirm.
- The button signs 7 sequential AMM swaps over ~12 seconds:
  - 5 × 400 pALPHA sells: pALPHA price walks 1.00 → 0.51 → 0.31 → 0.21 → 0.15 → 0.11
  - 2 × 250 pCORE sells: pCORE price walks 1.00 → 0.64 → 0.44
- Then switch Phantom to `lp_prime`.
- Navigate to `/trade`. Sell 50 pPRIME → ~49 USDC. Prime pool price barely moves (~0.98).

**Say:**
> *"Now watch how the market reprices this risk in real time."*
> [click Run Market Reaction, watch pALPHA chart cascade]
> *"Alpha collapses — five trades, one after another, walking price toward NAV."*
> [Core cascade plays]
> *"Core reprices too, but only by a third — matching its actual loss."*
> [switch wallet, swap pPRIME]
> *"And Prime? Prime holds. The market understands risk in real time."*

### Phase 7 — Withdraw (2:05 → 2:25)

**Action:**
- Stay on `lp_prime` wallet. Navigate to dashboard. Click "Withdraw" on Prime position.
- Confirm. Card shows "Withdrew $5,020.55 of $5,000 deposit · +0.41% yield".
- Switch Phantom to `lp_alpha`. Click "Withdraw" on Alpha position.
- Confirm. Card shows "Withdrew $0.00 of $2,000 deposit · 100% loss".
- Both cards visible side-by-side.

**Say:**
> *"The Prime holder exits and walks away with their principal plus yield. The Alpha holder exits and walks away with nothing."*

### Phase 8 — Closing line (2:25 → 2:30) ★ EXACT

**Action:**
- Cursor pulled back, full dashboard visible. Both withdraw cards still on screen. PnL panel still on screen.

**★ EXACT closing:**
> *"Today, credit markets are opaque and illiquid."*
> [breath]
> *"We just showed how they become programmable, transparent, and tradable."*

[Hold the frame for ~2 seconds, then stop recording.]

---

## 4. Fallback paths

If something goes wrong during the take, **don't restart from scratch**. Identify which segment broke and re-record only that segment. Stitch in post.

| Failure | Fallback |
|---|---|
| Switchboard `Trigger Default` fails | Click "Trigger Default (Admin)" instead. Dashboard renders identically. Don't mention this on camera |
| `Run Market Reaction` button hangs on a tx | Refresh the page. The first ~3 swaps may have completed; the button continues from where it left off (idempotent per swap) |
| Devnet RPC fails mid-tx | Wait 30 sec. Retry. If repeated → switch to backup RPC: `NEXT_PUBLIC_RPC_URL=<backup>` in `.env.local`, restart |
| Phantom rejects a transaction (rare) | Click again. Sometimes Phantom's first prompt closes too fast |
| You stumble on the **★ EXACT** killer sentence | Re-record only that 5-second clip. Stitch in post. Do NOT improvise — those lines are locked for a reason |
| Cascade animation lags or jitters | Refresh, reset to vault N+1, retry from setup |

---

## 5. Post-recording checklist

Before declaring "done":

- [ ] Watch the recording end-to-end at 1.0× speed, no skipping
- [ ] Verify total length is 2:25–2:30 (use OBS file properties or QuickTime info)
- [ ] Audio is clear, no clipping, no background noise
- [ ] All ★ EXACT lines delivered word-for-word
- [ ] No visible private keys, terminal output, or other off-screen content
- [ ] No mouse drift to non-PRISM tabs
- [ ] Cascade animation visible and not cut off
- [ ] PnL panel numbers readable
- [ ] Closing line delivered with appropriate gravitas (not rushed)

If all checked → **export and back up the video to two locations** (local + cloud) before doing anything else.

---

## 6. Day 16 — submission

The recording is your single source of truth video. Day 16 tasks (per [06-mvp-build-plan.md](06-mvp-build-plan.md) Phase 5):

1. Upload video to YouTube / Vimeo as **unlisted** (not private — judges need link access)
2. Submit to **Frontier (Colosseum)** at https://arena.colosseum.org with video link + GitHub repo
3. Submit to **Encrypt + Ika side track** on Superteam Earn
4. Submit to **Cloak side track** (if integration shipped)
5. Submit to **Dune SIM side track**
6. Submit to **Dodo Payments (Superteam India regional)** if eligible
7. Push final commit tagged `v0.1.0-frontier-submission`

Each submission needs the same artifacts:
- GitHub repo URL (public)
- Demo video link (unlisted YouTube/Vimeo)
- Live dApp URL (Vercel deployment of `app/`)
- README with project description, integration docs, setup steps

Post-submission: tweet a thread with the demo video, tagging Colosseum and the side track sponsors. Most teams skip this — high-leverage move.

---

## 7. The single most important rule

**The default cascade and the killer sentence are the moments that win or lose this hackathon.** Everything else is supporting context.

If you have to choose between recording extra phases or getting Phase 5 (default moment) and Phase 8 (closing line) absolutely perfect — **prioritize Phase 5 and Phase 8**.

Re-record those two as many times as needed. The opening 30 seconds and middle trades are forgivable. The cascade and the closing are not.
