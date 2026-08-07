/**
 * The Tomorrow’s Tech AI mark.
 *
 * Vector-traced from the master logo art, so it stays sharp at any size and
 * costs ~2KB inline instead of a raster request. The two wings carry the brand
 * gradients: brushed silver on the left, blue on the right.
 *
 * Inlined rather than loaded as an <img> so it paints with the first byte of
 * HTML — no layout shift in the sticky header. Raster and standalone-SVG
 * copies live in `public/brand/` for anything outside the app.
 */

type Props = {
  size?: number;
  className?: string;
  /** Drops the blue glow. Use on light or busy backgrounds. */
  flat?: boolean;
};

const MARK_W = 528;
const MARK_H = 372;

export function BrandMark({ size = 34, className, flat = false }: Props) {
  return (
    <svg
      width={size}
      height={Math.round((size * MARK_H) / MARK_W)}
      viewBox={`0 0 ${MARK_W} ${MARK_H}`}
      className={className}
      role="img"
      aria-label="Tomorrow’s Tech AI"
      style={flat ? undefined : { filter: "drop-shadow(0 0 14px rgba(59,130,246,0.3))" }}
    >
      <defs>
        <linearGradient id="ttai-silver" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F4F7FA" />
          <stop offset="46%" stopColor="#A8B2BC" />
          <stop offset="72%" stopColor="#6E7A86" />
          <stop offset="100%" stopColor="#D7DEE5" />
        </linearGradient>
        <linearGradient id="ttai-blue" x1="0" y1="0" x2="0.15" y2="1">
          <stop offset="0%" stopColor="#5AC8FF" />
          <stop offset="42%" stopColor="#1E7FE0" />
          <stop offset="78%" stopColor="#0B5BB5" />
          <stop offset="100%" stopColor="#1E90F0" />
        </linearGradient>
      </defs>
      <g transform="translate(0,372) scale(0.1,-0.1)">
        <path fill="url(#ttai-silver)" d={SILVER} />
        <path fill="url(#ttai-blue)" d={BLUE} />
      </g>
    </svg>
  );
}

/* Traced path data — kept below the component so the readable part stays on top. */
const SILVER =
  "M4583 3653 c32 -2 81 -2 110 0 29 2 3 3 -58 3 -60 0 -84 -1 -52 -3z M4873 3653 c37 -2 96 -2 130 0 34 2 4 3 -68 3 -71 0 -99 -1 -62 -3z M5097 3653 c18 -2 50 -2 70 0 21 2 7 4 -32 4 -38 0 -55 -2 -38 -4z M73 3627 c-2 -4 3 -10 11 -13 8 -3 18 -16 22 -27 7 -22 61 -104 210 -315 l77 -111 1285 -1 1284 0 -4 10 c-2 5 -101 108 -220 228 -120 120 -218 222 -218 227 0 4 10 0 22 -11 l23 -19 -20 24 -20 23 -1223 -3 c-673 -2 -1226 -7 -1229 -12z M530 2945 c0 -3 5 -11 11 -18 5 -7 41 -57 79 -112 38 -55 106 -153 152 -217 l83 -117 485 -3 485 -3 8 10 c4 6 5 -6 2 -25 -8 -49 -8 -38 -6 -750 l2 -645 138 -165 c81 -98 143 -164 152 -162 8 2 11 0 7 -4 -4 -4 0 -12 9 -19 9 -7 17 -19 19 -28 3 -19 85 -127 97 -127 5 0 17 -10 28 -22 l18 -23 1 1218 0 1217 -885 0 c-487 0 -885 -2 -885 -5z M4272 2893 c59 -2 158 -2 220 0 62 1 14 3 -107 3 -121 0 -172 -2 -113 -3z M3153 2050 c0 -41 2 -58 4 -37 2 20 2 54 0 75 -2 20 -4 3 -4 -38z M2314 1060 c0 -135 2 -190 3 -122 2 67 2 177 0 245 -1 67 -3 12 -3 -123z";
const BLUE =
  "M3338 3632 l-688 -2 0 -10 c0 -6 7 -10 15 -10 8 0 15 -8 15 -17 0 -10 48 -65 105 -122 58 -58 105 -101 105 -97 0 5 7 3 15 -4 8 -7 13 -15 10 -19 -2 -4 33 -43 77 -87 45 -43 76 -71 69 -61 -21 28 -7 20 25 -15 16 -17 22 -27 14 -23 -8 4 -6 -1 5 -11 l20 -19 867 0 866 0 34 45 c18 25 40 55 48 67 8 11 65 90 125 175 138 191 147 206 135 213 -5 3 -271 4 -592 3 -321 -2 -892 -4 -1270 -6z M3185 2912 l-580 -2 2 -83 3 -82 -9 20 -10 20 2 -760 2 -760 5 435 c3 239 5 12 3 -505 -1 -517 -3 -982 -5 -1032 -2 -51 0 -92 4 -90 4 1 60 65 124 142 65 77 156 185 203 239 72 84 130 152 226 269 l15 17 1 838 c0 460 3 832 5 826 3 -7 13 -10 22 -8 9 3 271 6 582 7 l564 2 41 57 c22 31 83 116 135 188 52 73 114 159 138 191 23 33 40 64 36 70 l-6 10 -461 -3 c-254 -2 -723 -4 -1042 -6z m1307 -19 c-62 -2 -161 -2 -220 0 -59 1 -8 3 113 3 121 0 169 -2 107 -3z m-1885 -396 c-2 -23 -3 -1 -3 48 0 50 1 68 3 42 2 -26 2 -67 0 -90z m0 -284 c-2 -32 -3 -8 -3 52 0 61 1 87 3 58 2 -29 2 -78 0 -110z m550 -200 c-2 -21 -4 -4 -4 37 0 41 2 58 4 38 2 -21 2 -55 0 -75z";
