# PRISM Marketing Video — Voiceover Script

Synced beat-for-beat to [`Composition.tsx`](src/Composition.tsx). Target total
length: **44 seconds** (leaves a 1-second sound-design tail on the 45-second
video). Total word count: **~110 words** at ~150 WPM.

---

## Performance direction (paste into ElevenLabs / Cartesia / Play.ht)

- **Voice profile:** male, low-mid register, controlled. Think *late-night
  business documentary*, not crypto-bro hype.
- **Pacing:** confident, unhurried. Let the killer lines breathe — never rush
  out of a punchline.
- **Tone:** institutional, slightly skeptical at the top → quietly assertive in
  the middle → grounded at the close. No upspeak. No vocal fry.
- **Reference voices:** Bloomberg Quint narrator, Stripe Sessions trailers,
  Vercel Ship recap voiceover.

ElevenLabs settings (starting point):
```
Model:        Eleven Multilingual v2 or Eleven Turbo v2.5
Voice:        "Adam" / "Brian" / "Daniel" — or a custom-cloned male voice
Stability:    45
Similarity:   65
Style:        15  (pull this DOWN if it sounds dramatic)
Speaker boost: ON
```

---

## The script (timed to scene cuts)

> `[ ]` = pause beat. `**word**` = emphasis. `(...)` = direction.

### Scene 1 — Hook · 0:00 → 0:07

```
Every lending protocol on Solana still treats credit risk like
one bucket.

[ beat ]

**PRISM splits it.** Into a market.
```
*~17 words · land "PRISM splits it" exactly as the gradient hits "one pool."*

### Scene 2 — Waterfall · 0:07 → 0:17

```
One pool. Three tranches.

Prime gets paid first, and loses last.
Alpha takes first loss for the highest upside.
Core sits in the middle.

**Yield flows up.** Losses flow down.
```
*~28 words · drop in volume slightly on "Losses flow down" — heavier, slower.*

### Scene 3 — Product · 0:17 → 0:28

```
Everything lives on-chain.

Deposits. Defaults. Real PnL — accounted in fixed-point NAV.

Every credit event runs the full loss waterfall
in a single Solana transaction.
```
*~25 words · "Deposits. Defaults. Real PnL." matches the on-screen rhythm —
hit each word with the same beat the text uses.*

### Scene 4 — Trading · 0:28 → 0:35

```
Each tranche is its own SPL token, trading live against USDC.

When credit moves, **prices react.**
```
*~17 words · "prices react" lands on the gradient word.*

### Scene 5 — Sponsors · 0:35 → 0:41

```
Ika brings cross-chain collateral.
Encrypt keeps credit data private.
Cloak shields the payouts.

Not logo soup. **Protocol primitives.**
```
*~16 words · staccato delivery on the three sponsors — one beat each.*

### Scene 6 — CTA · 0:41 → 0:45

```
Structured credit. Built on Solana.

PRISM Protocol — **docs dot prism protocol dot dev.**
```
*~13 words · final line is a domain readout. Read each segment cleanly.*

**Total: ~116 words. ~44 seconds at 150 WPM.**

---

## Single-block version (paste-ready for TTS)

For tools that don't support per-scene generation, here's a clean monoblock.
The ellipses `…` are intentional pause markers — most TTS engines honor them
as ~400ms beats.

```
Every lending protocol on Solana still treats credit risk like one bucket.
… PRISM splits it. Into a market.

One pool. Three tranches. Prime gets paid first, and loses last. Alpha takes
first loss for the highest upside. Core sits in the middle. Yield flows up.
Losses flow down.

Everything lives on-chain. Deposits. Defaults. Real PnL — accounted in
fixed-point NAV. Every credit event runs the full loss waterfall in a single
Solana transaction.

Each tranche is its own SPL token, trading live against USDC. When credit
moves, prices react.

Ika brings cross-chain collateral. Encrypt keeps credit data private. Cloak
shields the payouts. Not logo soup. Protocol primitives.

Structured credit. Built on Solana. PRISM Protocol — docs dot prism protocol
dot dev.
```

---

## Alternate hook (B-test)

If the first line lands flat in voice tests, try this colder open:

```
Crypto rebuilt exchanges. It rebuilt liquidity. It rebuilt stablecoins.

[ beat ]

Credit is still broken.

[ beat ]

PRISM is the fix.
```

Replaces Scene 1 only. Adds ~3 seconds — pull from Waterfall by tightening
"Prime gets paid first, and loses last → Prime pays first, loses last."

---

## Wiring the audio into Remotion

When you have `voice.mp3` (or `voice.wav`), drop it into `public/audio/` and
add a single line at the top of `PrismMarketingVideo` in
[Composition.tsx](src/Composition.tsx):

```tsx
import { Audio, staticFile } from "remotion";

export const PrismMarketingVideo = ({ variant = "landscape" }) => {
  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      <Audio src={staticFile("audio/voice.mp3")} />   {/* ← add this */}
      <Background variant={variant} />
      {/* ...rest unchanged */}
    </AbsoluteFill>
  );
};
```

Then re-render. If the voiceover ends earlier or later than 45s, adjust the
`DURATION` constant or trim/extend the audio file — don't fight per-scene
timings.

Optional polish: add a low background music bed at -22 dB:

```tsx
<Audio src={staticFile("audio/bed.mp3")} volume={0.12} />
```

A subtle synth-pad or piano works — avoid percussion. Recommended free
sources: Pixabay Music, Uppbeat (free tier), Epidemic Sound (paid).

---

## Captions (recommended — 85% of social video is watched muted)

After generating the voiceover, run through [Whisper](https://openai.com/whisper)
or [Captionate](https://captionate.com) to produce an `.srt`, then add to the
composition:

```bash
npx remotion add @remotion/captions
```

The line layout in `Composition.tsx` already includes the headlines as
on-screen text, so captions can be **off** during scenes where the text
already carries the message (Hook, Waterfall, CTA) and **on** during the
narration-only beats (Product, Trading, Sponsors).
