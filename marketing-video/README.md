# PRISM Marketing Video

A 45-second Remotion video for PRISM Protocol's Frontier hackathon submission and
distribution. Two formats (16:9 + 9:16), a still poster, plus social copy.

## What's in `out/`

| File | Format | Use |
|---|---|---|
| `prism-marketing.mp4` | 1920×1080 · 45s · h264 · CRF 18 · bt709 | Twitter, landing page, YouTube |
| `prism-marketing-vertical.mp4` | 1080×1920 · 45s · h264 · CRF 18 · bt709 | TikTok, Reels, Shorts |
| `poster.jpg` | 1280×720 · JPEG q92 | Social card preview, og:image |

## The 45-second story

| t | Scene | Beat |
|---|---|---|
| 0:00–0:07 | **Hook** | "crypto credit has a blind spot." → "Risk is still one pool." → "PRISM turns it into a market." |
| 0:07–0:17 | **Waterfall** | "Yield flows up. Losses flow down." with Prime / Core / Alpha tranche cards |
| 0:17–0:28 | **Product** | Live Mission Control dashboard — "Deposits. Defaults. Real PnL." |
| 0:28–0:35 | **Trading** | Live Liquidity Hub — "When credit moves, prices react." |
| 0:35–0:41 | **Sponsors** | Ika · Encrypt · Cloak · Dune SIM · Dodo — "Not logo soup. Protocol primitives." |
| 0:41–0:45 | **CTA** | "Structured credit, built on Solana." + `docs.prismprotocol.dev` |

## Run it locally

```bash
pnpm install
pnpm dev               # open Remotion Studio in browser to scrub frames
```

## Render

```bash
pnpm run render            # 1920×1080 (≈40s)
pnpm run render:vertical   # 1080×1920 (≈40s)
pnpm run render:thumbnail  # poster.jpg
pnpm run render:all        # everything above, sequentially
pnpm run render:draft      # fast iteration cut (CRF 28)
```

All commands write to `out/`. Production renders use h264 / CRF 18 / bt709.

## Project layout

```
src/
├── Composition.tsx   ← the entire video lives here (single file, 6 scenes + thumbnail)
├── Root.tsx          ← registers PrismMarketingLandscape / Vertical / Thumbnail
├── index.ts          ← entry point
└── index.css         ← tailwind import (unused by the video; safe to keep)

public/assets/
├── prism-header-mark.svg, prism.png, prism-wordmark-light.svg
├── ui-dashboard.png, ui-trade.png         ← product screenshots
└── ika-logo.png, encrypt-logo.png, cloak-logo.png, dune-logo.png, dodo-logo.png
```

## Iterating on the content

The video is one self-contained file: [src/Composition.tsx](src/Composition.tsx).

- **Change copy:** edit the strings in `HookScene`, `WaterfallScene`, etc.
- **Change colors:** edit the `COLORS` const at the top of `Composition.tsx`
- **Change timing:** each scene reads a `start` frame and exits via `fadeOut(frame, A, B)`.
  Total duration lives in `DURATION = 45` (seconds × 30 fps).
- **Add a scene:** insert a new `<NewScene variant={variant} />` in
  `PrismMarketingVideo`, define its `start` frame, and add a corresponding
  `fadeOut` window.

## Post copy

See [SOCIAL_COPY.md](SOCIAL_COPY.md) for tweet variants, landing-page caption, and
hashtag suggestions.

## Watermarks / branding

The "PRISM Protocol" lockup in the top-left corner appears on every scene via
the shared `LogoBug` component. To rebrand or remove, edit `LogoBug` in
`Composition.tsx`.
