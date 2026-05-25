import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { CSSProperties, ReactNode } from "react";

const COLORS = {
  bg: "#05020a",
  bg2: "#0c0714",
  panel: "rgba(18, 14, 27, 0.76)",
  border: "rgba(255, 255, 255, 0.13)",
  text: "rgba(255, 255, 255, 0.96)",
  muted: "rgba(255, 255, 255, 0.64)",
  dim: "rgba(255, 255, 255, 0.42)",
  purple: "#b673f8",
  pink: "#eca8d6",
  cyan: "#67e8f9",
  amber: "#fbbf24",
  green: "#14f195",
  red: "#ff6b86",
};

const DURATION = 45;

type Variant = "landscape" | "vertical";

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

const ease = Easing.bezier(0.16, 1, 0.3, 1);

const seqFrame = (frame: number, start: number) => frame - start;

const fade = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, end], [0, 1], { ...clamp, easing: ease });

const fadeOut = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, end], [1, 0], { ...clamp, easing: ease });

const enter = (localFrame: number, fps: number, delay = 0) =>
  spring({
    frame: localFrame - delay,
    fps,
    config: { damping: 200, stiffness: 110 },
  });

const readable = (value: number) => Math.max(0, Math.min(1, value));

const full: CSSProperties = {
  position: "absolute",
  inset: 0,
};

const font: CSSProperties = {
  fontFamily:
    'Inter, Geist, "Instrument Sans", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

const mono: CSSProperties = {
  fontFamily:
    '"JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace',
};

const Background = ({ variant }: { variant: Variant }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const drift = Math.sin(frame / 90) * 24;
  const isVertical = variant === "vertical";

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 20% 16%, rgba(182,115,248,0.22), transparent 32%), radial-gradient(circle at 82% 28%, rgba(103,232,249,0.15), transparent 28%), radial-gradient(circle at 50% 92%, rgba(236,168,214,0.14), transparent 35%), #05020a",
        overflow: "hidden",
      }}
    >
      <svg width={width} height={height} style={{ ...full, opacity: 0.12 }}>
        <g transform={`translate(${drift} ${drift * -0.5})`}>
          {Array.from({
            length: Math.ceil(width / (isVertical ? 72 : 92)) + 4,
          }).map((_, i) => {
            const step = isVertical ? 72 : 92;
            const x = i * step - step * 2;
            return (
              <line
                key={`v-${i}`}
                x1={x}
                y1={-height}
                x2={x}
                y2={height * 2}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="1"
              />
            );
          })}
          {Array.from({
            length: Math.ceil(height / (isVertical ? 72 : 92)) + 4,
          }).map((_, i) => {
            const step = isVertical ? 72 : 92;
            const y = i * step - step * 2;
            return (
              <line
                key={`h-${i}`}
                x1={-width}
                y1={y}
                x2={width * 2}
                y2={y}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="1"
              />
            );
          })}
        </g>
      </svg>
      <svg width={width} height={height} style={{ ...full, opacity: 0.2 }}>
        {Array.from({ length: 11 }).map((_, i) => {
          const y = (height / 10) * i + Math.sin(frame / 50 + i) * 18;
          return (
            <path
              key={i}
              d={`M ${-80} ${y} C ${width * 0.22} ${y - 70}, ${
                width * 0.55
              } ${y + 70}, ${width + 80} ${y - 30}`}
              stroke={
                i % 3 === 0
                  ? "rgba(236,168,214,0.23)"
                  : "rgba(103,232,249,0.14)"
              }
              strokeWidth="1"
              fill="none"
            />
          );
        })}
      </svg>
      <div
        style={{
          ...full,
          background:
            "radial-gradient(circle at center, transparent 32%, rgba(0,0,0,0.42) 100%)",
        }}
      />
      <svg width={width} height={height} style={{ ...full, opacity: 0.05 }}>
        <defs>
          <filter id="prism-noise">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.8"
              numOctaves="4"
              stitchTiles="stitch"
            />
          </filter>
        </defs>
        <rect width={width} height={height} filter="url(#prism-noise)" />
      </svg>
    </AbsoluteFill>
  );
};

const LogoBug = ({ variant }: { variant: Variant }) => (
  <div
    style={{
      position: "absolute",
      top: variant === "vertical" ? 54 : 42,
      left: variant === "vertical" ? 54 : 64,
      display: "flex",
      alignItems: "center",
      gap: 14,
      opacity: 0.92,
      ...font,
    }}
  >
    <Img
      src={staticFile("assets/prism-header-mark.svg")}
      style={{ width: 40, height: 40 }}
    />
    <div
      style={{
        color: COLORS.text,
        fontWeight: 760,
        letterSpacing: 0,
        fontSize: variant === "vertical" ? 27 : 23,
      }}
    >
      PRISM Protocol
    </div>
  </div>
);

const SceneShell = ({
  children,
  opacity,
  style,
}: {
  children: ReactNode;
  opacity: number;
  style?: CSSProperties;
}) => (
  <div
    style={{
      ...full,
      opacity: readable(opacity),
      ...style,
    }}
  >
    {children}
  </div>
);

const GradientText = ({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) => (
  <span
    style={{
      background:
        "linear-gradient(105deg, #ffffff 0%, #eca8d6 28%, #b673f8 58%, #67e8f9 100%)",
      WebkitBackgroundClip: "text",
      color: "transparent",
      ...style,
    }}
  >
    {children}
  </span>
);

const HookScene = ({ variant }: { variant: Variant }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const local = seqFrame(frame, 0);
  const isVertical = variant === "vertical";
  const main = enter(local, fps, 3);
  const second = enter(local, fps, 40);
  const bars = enter(local, fps, 92);
  const exit = fadeOut(local, 190, 230);
  const titleSize = isVertical ? 104 : 118;

  const cardStyle = (delay: number, color: string): CSSProperties => {
    const p = spring({
      frame: local - delay,
      fps,
      config: { damping: 200, stiffness: 135 },
    });
    return {
      transform: `scaleX(${p})`,
      transformOrigin: "left center",
      background: color,
      height: isVertical ? 62 : 50,
      borderRadius: 999,
      boxShadow: `0 0 42px ${color}55`,
    };
  };

  return (
    <SceneShell opacity={exit}>
      <div
        style={{
          position: "absolute",
          left: isVertical ? 70 : 126,
          top: isVertical ? 260 : 198,
          width: isVertical ? width - 140 : 940,
          ...font,
        }}
      >
        <div
          style={{
            color: COLORS.dim,
            fontSize: isVertical ? 31 : 27,
            fontWeight: 650,
            letterSpacing: 0,
            marginBottom: 28,
            opacity: main,
            transform: `translateY(${interpolate(main, [0, 1], [18, 0])}px)`,
          }}
        >
          crypto credit has a blind spot
        </div>
        <div
          style={{
            color: COLORS.text,
            fontSize: titleSize,
            lineHeight: 0.92,
            fontWeight: 890,
            letterSpacing: 0,
            maxWidth: isVertical ? 900 : 1020,
            opacity: main,
            transform: `translateY(${interpolate(main, [0, 1], [42, 0])}px)`,
            textShadow: "0 24px 90px rgba(0,0,0,0.55)",
          }}
        >
          Risk is still <GradientText>one pool.</GradientText>
        </div>
        <div
          style={{
            marginTop: 34,
            color: COLORS.text,
            fontSize: isVertical ? 60 : 57,
            fontWeight: 760,
            lineHeight: 1.04,
            opacity: second,
            transform: `translateY(${interpolate(second, [0, 1], [24, 0])}px)`,
          }}
        >
          PRISM turns it into a market.
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          right: isVertical ? 86 : 130,
          bottom: isVertical ? 285 : 185,
          width: isVertical ? width - 172 : 560,
          display: "grid",
          gap: isVertical ? 18 : 16,
          opacity: bars,
          transform: `translateY(${interpolate(bars, [0, 1], [28, 0])}px)`,
        }}
      >
        <div style={cardStyle(104, COLORS.green)} />
        <div style={cardStyle(116, COLORS.cyan)} />
        <div style={cardStyle(128, COLORS.pink)} />
      </div>
    </SceneShell>
  );
};

const TrancheCard = ({
  name,
  label,
  color,
  delay,
  local,
  variant,
  fps,
}: {
  name: string;
  label: string;
  color: string;
  delay: number;
  local: number;
  variant: Variant;
  fps: number;
}) => {
  const p = enter(local, fps, delay);
  const isVertical = variant === "vertical";

  return (
    <div
      style={{
        position: "relative",
        padding: isVertical ? "34px 34px" : "28px 30px",
        border: `1px solid ${COLORS.border}`,
        background:
          "linear-gradient(140deg, rgba(255,255,255,0.10), rgba(255,255,255,0.035))",
        borderRadius: 24,
        overflow: "hidden",
        boxShadow: "0 24px 80px rgba(0,0,0,0.28)",
        opacity: p,
        transform: `translateY(${interpolate(p, [0, 1], [34, 0])}px)`,
        ...font,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(circle at top right, ${color}33, transparent 52%)`,
        }}
      />
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 22,
        }}
      >
        <div
          style={{
            color: COLORS.text,
            fontSize: isVertical ? 50 : 42,
            fontWeight: 850,
            letterSpacing: 0,
          }}
        >
          {name}
        </div>
        <div
          style={{
            width: isVertical ? 18 : 14,
            height: isVertical ? 18 : 14,
            borderRadius: 999,
            background: color,
            boxShadow: `0 0 30px ${color}`,
          }}
        />
      </div>
      <div
        style={{
          position: "relative",
          color: COLORS.muted,
          fontSize: isVertical ? 30 : 25,
          lineHeight: 1.25,
          fontWeight: 560,
        }}
      >
        {label}
      </div>
    </div>
  );
};

const WaterfallScene = ({ variant }: { variant: Variant }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const start = 210;
  const local = seqFrame(frame, start);
  const isVertical = variant === "vertical";
  const intro = enter(local, fps, 0);
  const flow = enter(local, fps, 96);
  const opacity = fade(frame, start, start + 24) * fadeOut(frame, 462, 510);
  const lanes = [
    ["Prime", "paid first, loses last", COLORS.green],
    ["Core", "balanced risk layer", COLORS.cyan],
    ["Alpha", "first loss, highest upside", COLORS.pink],
  ] as const;

  return (
    <SceneShell opacity={opacity}>
      <div
        style={{
          position: "absolute",
          inset: isVertical ? "180px 58px 120px" : "150px 105px 100px",
          display: "grid",
          gridTemplateColumns: isVertical ? "1fr" : "0.86fr 1.14fr",
          alignItems: "center",
          gap: isVertical ? 54 : 72,
          ...font,
        }}
      >
        <div>
          <div
            style={{
              color: COLORS.muted,
              fontSize: isVertical ? 30 : 26,
              fontWeight: 660,
              marginBottom: 20,
              opacity: intro,
              transform: `translateY(${interpolate(intro, [0, 1], [22, 0])}px)`,
            }}
          >
            same pool, different risk
          </div>
          <div
            style={{
              color: COLORS.text,
              fontSize: isVertical ? 76 : 80,
              lineHeight: 0.98,
              fontWeight: 880,
              letterSpacing: 0,
              opacity: intro,
              transform: `translateY(${interpolate(intro, [0, 1], [34, 0])}px)`,
            }}
          >
            Yield flows up.
            <br />
            <GradientText>Losses flow down.</GradientText>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gap: isVertical ? 24 : 20,
          }}
        >
          {lanes.map(([name, label, color], index) => (
            <TrancheCard
              key={name}
              name={name}
              label={label}
              color={color}
              delay={22 + index * 12}
              local={local}
              variant={variant}
              fps={fps}
            />
          ))}
          <div
            style={{
              opacity: flow,
              transform: `translateY(${interpolate(flow, [0, 1], [28, 0])}px)`,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 18,
              marginTop: 6,
            }}
          >
            <FlowPill label="yield waterfall" color={COLORS.green} />
            <FlowPill label="loss cascade" color={COLORS.red} />
          </div>
        </div>
      </div>
    </SceneShell>
  );
};

const FlowPill = ({ label, color }: { label: string; color: string }) => (
  <div
    style={{
      borderRadius: 999,
      border: `1px solid ${color}55`,
      background: `${color}18`,
      color: COLORS.text,
      padding: "17px 20px",
      textAlign: "center",
      fontSize: 27,
      fontWeight: 720,
      ...font,
    }}
  >
    {label}
  </div>
);

const BrowserFrame = ({
  src,
  label,
  variant,
  local,
  fps,
}: {
  src: string;
  label: string;
  variant: Variant;
  local: number;
  fps: number;
}) => {
  const p = enter(local, fps, 6);
  const isVertical = variant === "vertical";

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        borderRadius: 22,
        background: "#19161f",
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 32px 110px rgba(0,0,0,0.48)",
        overflow: "hidden",
        opacity: p,
        transform: `perspective(1400px) rotateY(${
          isVertical ? 0 : -2
        }deg) rotateX(1deg) translateY(${interpolate(p, [0, 1], [32, 0])}px)`,
      }}
    >
      <div
        style={{
          height: isVertical ? 52 : 48,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 18px",
          borderBottom: "1px solid rgba(255,255,255,0.09)",
        }}
      >
        {[COLORS.red, COLORS.amber, COLORS.green].map((color) => (
          <div
            key={color}
            style={{
              width: 12,
              height: 12,
              borderRadius: 999,
              background: color,
              opacity: 0.82,
            }}
          />
        ))}
        <div
          style={{
            marginLeft: 12,
            borderRadius: 999,
            background: "rgba(255,255,255,0.075)",
            color: COLORS.dim,
            padding: "8px 18px",
            fontSize: isVertical ? 19 : 17,
            ...mono,
          }}
        >
          {label}
        </div>
      </div>
      <Img
        src={staticFile(src)}
        style={{
          width: "100%",
          display: "block",
        }}
      />
    </div>
  );
};

const ProductScene = ({ variant }: { variant: Variant }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const start = 510;
  const local = seqFrame(frame, start);
  const opacity = fade(frame, start, start + 24) * fadeOut(frame, 786, 840);
  const isVertical = variant === "vertical";
  const headline = enter(local, fps, 0);
  const badge = enter(local, fps, 84);

  return (
    <SceneShell opacity={opacity}>
      <div
        style={{
          position: "absolute",
          inset: isVertical ? "155px 54px 125px" : "128px 92px 90px",
          display: "grid",
          gridTemplateColumns: isVertical ? "1fr" : "0.72fr 1.28fr",
          alignItems: "center",
          gap: isVertical ? 44 : 70,
          ...font,
        }}
      >
        <div>
          <div
            style={{
              color: COLORS.muted,
              fontSize: isVertical ? 29 : 25,
              fontWeight: 680,
              opacity: headline,
              marginBottom: 18,
            }}
          >
            live protocol controls
          </div>
          <div
            style={{
              color: COLORS.text,
              fontSize: isVertical ? 70 : 74,
              lineHeight: 0.98,
              fontWeight: 880,
              letterSpacing: 0,
              opacity: headline,
              transform: `translateY(${interpolate(headline, [0, 1], [28, 0])}px)`,
            }}
          >
            Deposits.
            <br />
            Defaults.
            <br />
            <GradientText>Real PnL.</GradientText>
          </div>
          <div
            style={{
              marginTop: 34,
              display: "grid",
              gap: 14,
              opacity: badge,
              transform: `translateY(${interpolate(badge, [0, 1], [24, 0])}px)`,
            }}
          >
            <MiniMetric label="NAV per share" value="Q64.64" />
            <MiniMetric label="tranche tokens" value="pPRIME / pCORE / pALPHA" />
            <MiniMetric label="credit events" value="on-chain loss waterfall" />
          </div>
        </div>
        <BrowserFrame
          src="assets/ui-dashboard.png"
          label="app.prismprotocol.dev/dashboard"
          variant={variant}
          local={local}
          fps={fps}
        />
      </div>
    </SceneShell>
  );
};

const MiniMetric = ({ label, value }: { label: string; value: string }) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      gap: 18,
      borderRadius: 18,
      border: `1px solid ${COLORS.border}`,
      background: "rgba(255,255,255,0.06)",
      padding: "16px 18px",
      color: COLORS.text,
      alignItems: "center",
      fontSize: 21,
      ...font,
    }}
  >
    <span style={{ color: COLORS.muted, fontWeight: 610 }}>{label}</span>
    <span style={{ ...mono, color: COLORS.text, fontWeight: 740 }}>{value}</span>
  </div>
);

const TradingScene = ({ variant }: { variant: Variant }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const start = 840;
  const local = seqFrame(frame, start);
  const opacity = fade(frame, start, start + 24) * fadeOut(frame, 990, 1038);
  const isVertical = variant === "vertical";
  const title = enter(local, fps, 0);
  const arrow = enter(local, fps, 86);

  return (
    <SceneShell opacity={opacity}>
      <div
        style={{
          position: "absolute",
          inset: isVertical ? "175px 54px 120px" : "132px 92px 90px",
          display: "grid",
          gridTemplateColumns: isVertical ? "1fr" : "1.18fr 0.82fr",
          alignItems: "center",
          gap: isVertical ? 46 : 70,
          ...font,
        }}
      >
        <BrowserFrame
          src="assets/ui-trade.png"
          label="app.prismprotocol.dev/trade"
          variant={variant}
          local={local}
          fps={fps}
        />
        <div>
          <div
            style={{
              color: COLORS.muted,
              fontSize: isVertical ? 29 : 25,
              fontWeight: 680,
              marginBottom: 18,
              opacity: title,
            }}
          >
            market-priced risk
          </div>
          <div
            style={{
              color: COLORS.text,
              fontSize: isVertical ? 68 : 72,
              lineHeight: 0.98,
              fontWeight: 880,
              letterSpacing: 0,
              opacity: title,
            }}
          >
            When credit moves,
            <br />
            <GradientText>prices react.</GradientText>
          </div>
          <div
            style={{
              marginTop: 38,
              borderRadius: 26,
              padding: "24px 28px",
              background:
                "linear-gradient(135deg, rgba(255,107,134,0.16), rgba(182,115,248,0.16))",
              border: "1px solid rgba(255,255,255,0.13)",
              opacity: arrow,
              transform: `translateY(${interpolate(arrow, [0, 1], [28, 0])}px)`,
            }}
          >
            <div
              style={{
                color: COLORS.text,
                fontSize: isVertical ? 35 : 31,
                fontWeight: 760,
                lineHeight: 1.12,
              }}
            >
              AMM trading makes tranche risk liquid, inspectable, and tradable.
            </div>
          </div>
        </div>
      </div>
    </SceneShell>
  );
};

const SponsorScene = ({ variant }: { variant: Variant }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const start = 1038;
  const local = seqFrame(frame, start);
  const opacity = fade(frame, start, start + 24) * fadeOut(frame, 1174, 1218);
  const isVertical = variant === "vertical";
  const title = enter(local, fps, 0);
  const sponsors = [
    ["Ika", "cross-chain collateral", "assets/ika-logo.png"],
    ["Encrypt", "private credit signals", "assets/encrypt-logo.png"],
    ["Cloak", "shielded payouts", "assets/cloak-logo.png"],
    ["Dune SIM", "protocol analytics", "assets/dune-logo.png"],
    ["Dodo", "capital entry rails", "assets/dodo-logo.png"],
  ] as const;

  return (
    <SceneShell opacity={opacity}>
      <div
        style={{
          position: "absolute",
          inset: isVertical ? "180px 58px 130px" : "150px 110px 108px",
          display: "grid",
          gridTemplateRows: "auto 1fr",
          gap: isVertical ? 54 : 58,
          ...font,
        }}
      >
        <div
          style={{
            opacity: title,
            transform: `translateY(${interpolate(title, [0, 1], [24, 0])}px)`,
          }}
        >
          <div
            style={{
              color: COLORS.muted,
              fontSize: isVertical ? 30 : 26,
              fontWeight: 680,
              marginBottom: 16,
            }}
          >
            sponsors are built into the credit stack
          </div>
          <div
            style={{
              color: COLORS.text,
              fontSize: isVertical ? 67 : 76,
              lineHeight: 1,
              fontWeight: 880,
              letterSpacing: 0,
            }}
          >
            Not logo soup.
            <br />
            <GradientText>Protocol primitives.</GradientText>
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isVertical ? "1fr" : "repeat(5, 1fr)",
            gap: isVertical ? 18 : 18,
            alignSelf: "center",
          }}
        >
          {sponsors.map(([name, label, logo], index) => {
            const p = enter(local, fps, 52 + index * 9);
            return (
              <div
                key={name}
                style={{
                  minHeight: isVertical ? 136 : 230,
                  borderRadius: 24,
                  background:
                    "linear-gradient(150deg, rgba(255,255,255,0.105), rgba(255,255,255,0.034))",
                  border: `1px solid ${COLORS.border}`,
                  padding: isVertical ? "22px 28px" : "24px 20px",
                  display: "flex",
                  flexDirection: isVertical ? "row" : "column",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: isVertical ? 24 : 20,
                  opacity: p,
                  transform: `translateY(${interpolate(p, [0, 1], [30, 0])}px)`,
                  boxShadow: "0 24px 70px rgba(0,0,0,0.30)",
                }}
              >
                <Img
                  src={staticFile(logo)}
                  style={{
                    maxWidth: isVertical ? 142 : 140,
                    maxHeight: isVertical ? 58 : 74,
                    objectFit: "contain",
                  }}
                />
                <div style={{ textAlign: isVertical ? "left" : "center" }}>
                  <div
                    style={{
                      color: COLORS.text,
                      fontSize: isVertical ? 32 : 28,
                      fontWeight: 800,
                      marginBottom: 8,
                    }}
                  >
                    {name}
                  </div>
                  <div
                    style={{
                      color: COLORS.muted,
                      fontSize: isVertical ? 24 : 21,
                      lineHeight: 1.2,
                      fontWeight: 560,
                    }}
                  >
                    {label}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </SceneShell>
  );
};

const CtaScene = ({ variant }: { variant: Variant }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const start = 1218;
  const local = seqFrame(frame, start);
  const opacity = fade(frame, start, start + 24);
  const isVertical = variant === "vertical";
  const logo = enter(local, fps, 0);
  const text = enter(local, fps, 24);
  const url = enter(local, fps, 62);

  return (
    <SceneShell opacity={opacity}>
      <div
        style={{
          position: "absolute",
          inset: isVertical ? "250px 70px 210px" : "175px 130px 150px",
          display: "grid",
          gridTemplateColumns: isVertical ? "1fr" : "0.9fr 1.1fr",
          alignItems: "center",
          gap: isVertical ? 54 : 80,
          ...font,
        }}
      >
        <div
          style={{
            display: "grid",
            placeItems: isVertical ? "center" : "start",
            opacity: logo,
            transform: `translateY(${interpolate(logo, [0, 1], [24, 0])}px)`,
          }}
        >
          <Img
            src={staticFile("assets/prism.png")}
            style={{
              width: isVertical ? 350 : 410,
              maxWidth: "100%",
              filter: "drop-shadow(0 0 80px rgba(182,115,248,0.38))",
            }}
          />
        </div>
        <div
          style={{
            textAlign: isVertical ? "center" : "left",
          }}
        >
          <div
            style={{
              color: COLORS.text,
              fontSize: isVertical ? 78 : 88,
              lineHeight: 0.96,
              fontWeight: 890,
              letterSpacing: 0,
              opacity: text,
              transform: `translateY(${interpolate(text, [0, 1], [28, 0])}px)`,
            }}
          >
            Structured credit,
            <br />
            <GradientText>built on Solana.</GradientText>
          </div>
          <div
            style={{
              marginTop: 34,
              color: COLORS.muted,
              fontSize: isVertical ? 32 : 31,
              lineHeight: 1.2,
              fontWeight: 570,
              opacity: text,
            }}
          >
            Prime / Core / Alpha tranches. Transparent NAV. Tradable risk.
          </div>
          <div
            style={{
              marginTop: 44,
              display: "grid",
              gap: 15,
              opacity: url,
              transform: `translateY(${interpolate(url, [0, 1], [20, 0])}px)`,
            }}
          >
            <div
              style={{
                color: COLORS.text,
                fontSize: isVertical ? 39 : 36,
                fontWeight: 800,
                ...mono,
              }}
            >
              docs.prismprotocol.dev
            </div>
            <div
              style={{
                color: COLORS.pink,
                fontSize: isVertical ? 29 : 26,
                fontWeight: 720,
              }}
            >
              lite paper: https://shorturl.at/D6SyU
            </div>
          </div>
        </div>
      </div>
    </SceneShell>
  );
};

export const PrismMarketingVideo = ({
  variant = "landscape",
}: {
  variant?: Variant;
}) => {
  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      <Background variant={variant} />
      <LogoBug variant={variant} />
      <HookScene variant={variant} />
      <WaterfallScene variant={variant} />
      <ProductScene variant={variant} />
      <TradingScene variant={variant} />
      <SponsorScene variant={variant} />
      <CtaScene variant={variant} />
    </AbsoluteFill>
  );
};

export const PrismThumbnail = () => (
  <AbsoluteFill style={{ background: COLORS.bg }}>
    <Background variant="landscape" />
    <div
      style={{
        position: "absolute",
        inset: "94px 110px",
        display: "grid",
        gridTemplateColumns: "0.9fr 1.1fr",
        gap: 66,
        alignItems: "center",
        ...font,
      }}
    >
      <div>
        <Img
          src={staticFile("assets/prism-header-mark.svg")}
          style={{ width: 64, height: 64, marginBottom: 30 }}
        />
        <div
          style={{
            color: COLORS.text,
            fontSize: 98,
            lineHeight: 0.92,
            fontWeight: 900,
            letterSpacing: 0,
          }}
        >
          Risk becomes
          <br />
          <GradientText>a market.</GradientText>
        </div>
        <div
          style={{
            marginTop: 26,
            color: COLORS.muted,
            fontSize: 30,
            fontWeight: 620,
          }}
        >
          PRISM Protocol on Solana
        </div>
      </div>
      <BrowserFrame
        src="assets/ui-dashboard.png"
        label="app.prismprotocol.dev/dashboard"
        variant="landscape"
        local={120}
        fps={30}
      />
    </div>
  </AbsoluteFill>
);

export const VIDEO_DURATION_FRAMES = DURATION * 30;
