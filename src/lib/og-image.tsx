import { ImageResponse } from "next/og";

export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

type Props = {
  title: string;
  subtitle?: string;
  eyebrow?: string;
};

/**
 * Social share card.
 *
 * Satori (which powers next/og) renders a useful subset of SVG, so the brand
 * mark is drawn inline here rather than fetched — the card stays a single
 * self-contained render with no network dependency at build time. Flat fills
 * are used instead of the gradients: Satori does not resolve gradient refs.
 */
const MARK_SILVER =
  "M4583 3653 c32 -2 81 -2 110 0 29 2 3 3 -58 3 -60 0 -84 -1 -52 -3z M4873 3653 c37 -2 96 -2 130 0 34 2 4 3 -68 3 -71 0 -99 -1 -62 -3z M5097 3653 c18 -2 50 -2 70 0 21 2 7 4 -32 4 -38 0 -55 -2 -38 -4z M73 3627 c-2 -4 3 -10 11 -13 8 -3 18 -16 22 -27 7 -22 61 -104 210 -315 l77 -111 1285 -1 1284 0 -4 10 c-2 5 -101 108 -220 228 -120 120 -218 222 -218 227 0 4 10 0 22 -11 l23 -19 -20 24 -20 23 -1223 -3 c-673 -2 -1226 -7 -1229 -12z M530 2945 c0 -3 5 -11 11 -18 5 -7 41 -57 79 -112 38 -55 106 -153 152 -217 l83 -117 485 -3 485 -3 8 10 c4 6 5 -6 2 -25 -8 -49 -8 -38 -6 -750 l2 -645 138 -165 c81 -98 143 -164 152 -162 8 2 11 0 7 -4 -4 -4 0 -12 9 -19 9 -7 17 -19 19 -28 3 -19 85 -127 97 -127 5 0 17 -10 28 -22 l18 -23 1 1218 0 1217 -885 0 c-487 0 -885 -2 -885 -5z M4272 2893 c59 -2 158 -2 220 0 62 1 14 3 -107 3 -121 0 -172 -2 -113 -3z M3153 2050 c0 -41 2 -58 4 -37 2 20 2 54 0 75 -2 20 -4 3 -4 -38z M2314 1060 c0 -135 2 -190 3 -122 2 67 2 177 0 245 -1 67 -3 12 -3 -123z";
const MARK_BLUE =
  "M3338 3632 l-688 -2 0 -10 c0 -6 7 -10 15 -10 8 0 15 -8 15 -17 0 -10 48 -65 105 -122 58 -58 105 -101 105 -97 0 5 7 3 15 -4 8 -7 13 -15 10 -19 -2 -4 33 -43 77 -87 45 -43 76 -71 69 -61 -21 28 -7 20 25 -15 16 -17 22 -27 14 -23 -8 4 -6 -1 5 -11 l20 -19 867 0 866 0 34 45 c18 25 40 55 48 67 8 11 65 90 125 175 138 191 147 206 135 213 -5 3 -271 4 -592 3 -321 -2 -892 -4 -1270 -6z M3185 2912 l-580 -2 2 -83 3 -82 -9 20 -10 20 2 -760 2 -760 5 435 c3 239 5 12 3 -505 -1 -517 -3 -982 -5 -1032 -2 -51 0 -92 4 -90 4 1 60 65 124 142 65 77 156 185 203 239 72 84 130 152 226 269 l15 17 1 838 c0 460 3 832 5 826 3 -7 13 -10 22 -8 9 3 271 6 582 7 l564 2 41 57 c22 31 83 116 135 188 52 73 114 159 138 191 23 33 40 64 36 70 l-6 10 -461 -3 c-254 -2 -723 -4 -1042 -6z m1307 -19 c-62 -2 -161 -2 -220 0 -59 1 -8 3 113 3 121 0 169 -2 107 -3z m-1885 -396 c-2 -23 -3 -1 -3 48 0 50 1 68 3 42 2 -26 2 -67 0 -90z m0 -284 c-2 -32 -3 -8 -3 52 0 61 1 87 3 58 2 -29 2 -78 0 -110z m550 -200 c-2 -21 -4 -4 -4 37 0 41 2 58 4 38 2 -21 2 -55 0 -75z";

function Mark({ width = 72 }: { width?: number }) {
  return (
    <svg width={width} height={(width * 372) / 528} viewBox="0 0 528 372">
      <g transform="translate(0,372) scale(0.1,-0.1)">
        <path fill="#CBD4DD" d={MARK_SILVER} />
        <path fill="#2E86F0" d={MARK_BLUE} />
      </g>
    </svg>
  );
}

export function generateOgImage({ title, subtitle, eyebrow }: Props) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#04070D",
          backgroundImage:
            "linear-gradient(rgba(59, 130, 246, 0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(59, 130, 246, 0.07) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          color: "#E9EFF7",
          position: "relative",
        }}
      >
        {/* Brand lockup */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <Mark width={72} />
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <div style={{ color: "#DCE3EA", fontSize: 27, fontWeight: 700, letterSpacing: "0.09em" }}>
              TOMORROW’S TECH
            </div>
            <div style={{ color: "#3B82F6", fontSize: 27, fontWeight: 700, letterSpacing: "0.09em" }}>
              AI
            </div>
          </div>
        </div>

        {/* Center content */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 1000 }}>
          {eyebrow && (
            <div
              style={{
                color: "#60A5FA",
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
              }}
            >
              {eyebrow}
            </div>
          )}
          <div
            style={{
              fontSize: 88,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              display: "flex",
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div
              style={{
                fontSize: 32,
                color: "rgba(233, 239, 247, 0.7)",
                lineHeight: 1.35,
                display: "flex",
              }}
            >
              {subtitle}
            </div>
          )}
        </div>

        {/* Bottom row */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            color: "rgba(233, 239, 247, 0.45)",
            fontSize: 20,
            letterSpacing: "0.12em",
          }}
        >
          <div>tomorrowstechai.com</div>
          <div style={{ color: "#3B82F6", textTransform: "uppercase" }}>
            Solutions for tomorrow. Results today.
          </div>
        </div>
      </div>
    ),
    { ...ogSize }
  );
}
