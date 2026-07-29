import type { CSSProperties, ReactNode } from "react";

/**
 * Hand-coded SVG "mini-mockups" that sit above each service card.
 * No image files, no network weight — they render as inline vectors and
 * animate on card hover via the .svc-* classes in globals.css.
 *
 * Shared canvas: 560 x 150 user units. Purely decorative -> aria-hidden.
 */

const CY = "#00D9FF";
const CY_SOFT = "#38B9D6";
const CY_DEEP = "#0E7C95";
const AM = "#F5A623";
const RED = "#E55353";
const LINE = "#22334A";
const FILL = "#16212E";
const WELL = "#0D1621";
const DIM = "#2A3B4F";

const MONO =
  "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace";

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 560 150"
      className="w-full h-auto block"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

const delay = (ms: number): CSSProperties => ({ transitionDelay: `${ms}ms` });

/* 01 — AI Command Centers -------------------------------------------------- */
export function VisualCommandCenter() {
  const bars = [22, 34, 28, 44, 30, 50, 38, 54, 46];
  const tiles = [24, 200, 376];

  return (
    <Svg>
      {tiles.map((x, i) => (
        <g key={x} className="svc-rise" style={delay(i * 70)}>
          <rect x={x} y={20} width={160} height={42} rx={4} fill={FILL} stroke={LINE} />
          <rect x={x + 14} y={31} width={42} height={3} rx={1.5} fill={DIM} />
          <rect
            x={x + 14}
            y={41}
            width={i === 1 ? 86 : 62}
            height={8}
            rx={2}
            fill={i === 1 ? CY : CY_DEEP}
            className={i === 1 ? "svc-glow" : undefined}
          />
          <circle
            cx={x + 144}
            cy={34}
            r={3.5}
            fill={i === 1 ? CY : DIM}
            className={i === 1 ? "svc-pulse" : undefined}
          />
        </g>
      ))}

      <line x1={24} y1={76} x2={536} y2={76} stroke={LINE} />

      {bars.map((h, i) => (
        <rect
          key={i}
          className="svc-bar"
          style={delay(i * 45)}
          x={24 + i * 40}
          y={130 - h}
          width={30}
          height={h}
          rx={2}
          fill={i === bars.length - 1 ? CY : CY_DEEP}
          opacity={0.45 + i * 0.06}
        />
      ))}

      <rect x={390} y={86} width={146} height={44} rx={4} fill={FILL} stroke={LINE} />
      <polyline
        className="svc-glow"
        points="402,120 422,111 442,117 462,101 482,107 502,93 524,98"
        fill="none"
        stroke={CY}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/* 02 — Smartsheet Consulting & Build-out ----------------------------------- */
export function VisualSmartsheet() {
  const rows = [40, 58, 76, 94, 112];
  const cols = [24, 180, 300, 420];
  const flagged = 76;

  return (
    <Svg>
      <rect x={24} y={20} width={512} height={110} rx={5} fill={FILL} stroke={LINE} />
      <rect x={24} y={20} width={512} height={20} fill="#1A2634" />

      {cols.slice(1).map((x) => (
        <line key={x} x1={x} y1={20} x2={x} y2={130} stroke={LINE} />
      ))}
      {rows.map((y) => (
        <line key={y} x1={24} y1={y} x2={536} y2={y} stroke={LINE} opacity={0.7} />
      ))}

      {[
        [36, 74],
        [192, 52],
        [312, 58],
        [432, 46],
      ].map(([x, w]) => (
        <rect key={x} x={x} y={27} width={w} height={5} rx={2.5} fill={CY_DEEP} />
      ))}

      <rect
        x={24}
        y={flagged}
        width={512}
        height={18}
        fill={AM}
        fillOpacity={0.11}
      />
      <rect x={24} y={flagged} width={2.5} height={18} fill={AM} />
      <path
        d={`M42,${flagged + 4} L49,${flagged + 15} L35,${flagged + 15} Z`}
        fill={AM}
        className="svc-pulse"
      />

      {rows.map((y) => {
        const hot = y === flagged;
        return (
          <g key={y}>
            <rect
              x={hot ? 56 : 36}
              y={y + 7}
              width={hot ? 92 : 108}
              height={4}
              rx={2}
              fill={hot ? AM : DIM}
              opacity={hot ? 0.85 : 1}
            />
            <rect x={192} y={y + 7} width={64} height={4} rx={2} fill={DIM} />
            <rect x={312} y={y + 7} width={76} height={4} rx={2} fill={DIM} />
            <rect
              x={432}
              y={y + 7}
              width={hot ? 58 : 40}
              height={4}
              rx={2}
              fill={hot ? AM : CY_DEEP}
            />
          </g>
        );
      })}
    </Svg>
  );
}

/* 03 — Custom AI Workflow Design ------------------------------------------- */
export function VisualWorkflow() {
  const hubs = [22, 59, 96];

  return (
    <Svg>
      {hubs.map((y, i) => (
        <path
          key={`in-${y}`}
          className="svc-dash"
          style={{ animationDelay: `${i * 140}ms` }}
          d={`M96,75 C152,75 184,${y + 16} 240,${y + 16}`}
          fill="none"
          stroke={CY_DEEP}
          strokeWidth={1.5}
        />
      ))}
      {hubs.map((y, i) => (
        <path
          key={`out-${y}`}
          className="svc-dash"
          style={{ animationDelay: `${i * 140 + 70}ms` }}
          d={`M324,${y + 16} C380,${y + 16} 412,75 464,75`}
          fill="none"
          stroke={CY_DEEP}
          strokeWidth={1.5}
        />
      ))}

      <g className="svc-rise">
        <rect x={24} y={55} width={72} height={40} rx={6} fill={FILL} stroke={CY_DEEP} />
        <rect x={36} y={67} width={40} height={4} rx={2} fill={CY_DEEP} />
        <rect x={36} y={77} width={28} height={4} rx={2} fill={DIM} />
      </g>

      {hubs.map((y, i) => (
        <g key={y} className="svc-rise" style={delay(i * 80)}>
          <rect x={240} y={y} width={84} height={32} rx={5} fill={FILL} stroke={i === 1 ? CY : LINE} />
          <circle
            cx={256}
            cy={y + 16}
            r={4}
            fill={i === 1 ? CY : CY_DEEP}
            className={i === 1 ? "svc-pulse" : undefined}
          />
          <rect x={268} y={y + 11} width={42} height={4} rx={2} fill={DIM} />
          <rect x={268} y={y + 19} width={28} height={3} rx={1.5} fill={DIM} opacity={0.6} />
        </g>
      ))}

      <g className="svc-rise" style={delay(160)}>
        <rect x={464} y={55} width={72} height={40} rx={6} fill={FILL} stroke={CY} />
        <path
          d="M486,75 l7,8 l14,-16"
          fill="none"
          stroke={CY}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="svc-glow"
        />
      </g>
    </Svg>
  );
}

/* 04 — Custom AI App Development ------------------------------------------- */
export function VisualAppDev() {
  return (
    <Svg>
      <rect x={24} y={20} width={512} height={110} rx={8} fill={FILL} stroke={LINE} />
      <path
        d="M24,28 a8,8 0 0 1 8,-8 h496 a8,8 0 0 1 8,8 v14 h-512 z"
        fill="#1A2634"
      />
      {[40, 54, 68].map((cx, i) => (
        <circle key={cx} cx={cx} cy={31} r={3.5} fill={i === 2 ? CY_DEEP : DIM} />
      ))}

      <rect x={24} y={42} width={96} height={88} fill={WELL} />
      <line x1={120} y1={42} x2={120} y2={130} stroke={LINE} />
      {[56, 72, 88, 104].map((y, i) => (
        <g key={y}>
          <rect x={36} y={y} width={6} height={6} rx={1.5} fill={i === 0 ? CY : DIM} />
          <rect
            x={48}
            y={y + 1}
            width={i === 0 ? 54 : 44}
            height={4}
            rx={2}
            fill={i === 0 ? CY_SOFT : DIM}
            opacity={i === 0 ? 1 : 0.75}
          />
        </g>
      ))}

      <rect x={140} y={56} width={168} height={8} rx={3} fill={CY_SOFT} opacity={0.85} />
      <rect x={140} y={76} width={300} height={5} rx={2.5} fill={DIM} />
      <rect x={140} y={88} width={250} height={5} rx={2.5} fill={DIM} />
      <rect
        x={140}
        y={104}
        width={92}
        height={20}
        rx={4}
        fill={CY}
        opacity={0.9}
        className="svc-glow"
      />
      <rect x={244} y={104} width={68} height={20} rx={4} fill="none" stroke={LINE} />

      <rect x={400} y={86} width={4} height={9} fill={CY} className="svc-pulse" />
      <text
        x={456}
        y={64}
        fontFamily={MONO}
        fontSize={9}
        letterSpacing={1.6}
        fill={CY_DEEP}
      >
        TS/NEXT
      </text>
    </Svg>
  );
}

/* 05 — Local AI Deployment ------------------------------------------------- */
export function VisualLocalAI() {
  return (
    <Svg>
      <rect
        x={24}
        y={20}
        width={512}
        height={110}
        rx={10}
        fill="none"
        stroke={CY_DEEP}
        strokeWidth={1.5}
        strokeDasharray="6 8"
        opacity={0.55}
        className="svc-dash"
      />

      <g className="svc-glow">
        <path
          d="M104,74 v-9 a10,10 0 0 1 20,0 v9"
          fill="none"
          stroke={CY}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        <rect x={97} y={74} width={34} height={28} rx={4} fill={FILL} stroke={CY} strokeWidth={1.5} />
        <circle cx={114} cy={86} r={3} fill={CY} />
        <rect x={112.6} y={86} width={2.8} height={8} rx={1.4} fill={CY} />
      </g>
      <text
        x={114}
        y={118}
        textAnchor="middle"
        fontFamily={MONO}
        fontSize={9}
        letterSpacing={1.6}
        fill={CY_DEEP}
      >
        PRIVATE
      </text>

      <g className="svc-rise">
        <rect x={196} y={38} width={158} height={74} rx={6} fill={FILL} stroke={CY_DEEP} />
        {[50, 68, 86].map((y, i) => (
          <g key={y}>
            <rect x={208} y={y} width={110} height={14} rx={3} fill={WELL} />
            <rect x={216} y={y + 5} width={38} height={4} rx={2} fill={DIM} />
            <circle
              cx={332}
              cy={y + 7}
              r={3.5}
              fill={i === 0 ? CY : DIM}
              className={i === 0 ? "svc-pulse" : undefined}
            />
          </g>
        ))}
      </g>

      <g opacity={0.55}>
        <circle cx={432} cy={78} r={13} fill={DIM} />
        <circle cx={452} cy={68} r={17} fill={DIM} />
        <circle cx={472} cy={78} r={12} fill={DIM} />
        <rect x={432} y={74} width={40} height={16} rx={8} fill={DIM} />
      </g>
      <line
        x1={416}
        y1={98}
        x2={490}
        y2={52}
        stroke={RED}
        strokeWidth={2.5}
        strokeLinecap="round"
        opacity={0.8}
      />
    </Svg>
  );
}

/* 06 — Operations Automation ----------------------------------------------- */
export function VisualAutomation() {
  const nodes = [116, 228, 340];

  return (
    <Svg>
      {[
        [76, 116],
        [200, 228],
        [312, 340],
        [424, 452],
      ].map(([x1, x2]) => (
        <g key={x1}>
          <line x1={x1} y1={76} x2={x2} y2={76} stroke={LINE} strokeWidth={1.5} />
          <path
            d={`M${x2 - 9},71 l5,5 l-5,5`}
            fill="none"
            stroke={CY_DEEP}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      ))}

      <g className="svc-rise">
        <rect x={24} y={34} width={52} height={84} rx={8} fill={FILL} stroke={CY_DEEP} />
        <rect x={30} y={44} width={40} height={60} rx={3} fill={WELL} />
        <rect x={36} y={52} width={26} height={4} rx={2} fill={CY_DEEP} />
        <rect x={36} y={62} width={28} height={3} rx={1.5} fill={DIM} />
        <rect x={36} y={70} width={20} height={3} rx={1.5} fill={DIM} />
        <rect x={36} y={82} width={28} height={12} rx={3} fill={CY} opacity={0.85} className="svc-glow" />
        <rect x={42} y={108} width={16} height={3} rx={1.5} fill={DIM} />
      </g>

      {nodes.map((x, i) => (
        <g key={x} className="svc-rise" style={delay(i * 80)}>
          <rect x={x} y={58} width={84} height={36} rx={5} fill={FILL} stroke={LINE} />
          {i === 0 && (
            <>
              <rect x={x + 14} y={68} width={38} height={4} rx={2} fill={DIM} />
              <rect x={x + 14} y={78} width={28} height={4} rx={2} fill={DIM} />
              <circle cx={x + 66} cy={76} r={5} fill="none" stroke={CY_DEEP} strokeWidth={1.5} />
            </>
          )}
          {i === 1 && (
            <>
              <path
                d={`M${x + 20},76 l6,7 l13,-15`}
                fill="none"
                stroke={CY}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <rect x={x + 48} y={74} width={24} height={4} rx={2} fill={DIM} />
            </>
          )}
          {i === 2 && (
            <>
              <rect x={x + 14} y={68} width={44} height={4} rx={2} fill={DIM} />
              <rect x={x + 14} y={78} width={30} height={4} rx={2} fill={CY_DEEP} />
              <circle cx={x + 68} cy={76} r={4} fill={CY_DEEP} />
            </>
          )}
        </g>
      ))}

      <g className="svc-rise" style={delay(240)}>
        <rect x={452} y={44} width={64} height={64} rx={5} fill={FILL} stroke={CY} />
        <rect x={464} y={56} width={30} height={4} rx={2} fill={DIM} />
        <rect x={464} y={66} width={40} height={4} rx={2} fill={DIM} />
        <text
          x={484}
          y={98}
          textAnchor="middle"
          fontFamily={MONO}
          fontSize={20}
          fill={CY}
          className="svc-glow"
        >
          $
        </text>
      </g>

      <circle
        cx={88}
        cy={76}
        r={4.5}
        fill={CY}
        className="svc-travel"
        style={{ "--svc-travel-x": "372px" } as CSSProperties}
      />
    </Svg>
  );
}

/* 07 — Program Management Consulting --------------------------------------- */
export function VisualPMO() {
  const rows: Array<[number, number, number, string, boolean]> = [
    [26, 92, 168, CY_DEEP, false],
    [48, 150, 180, CY_SOFT, true],
    [70, 210, 190, CY_DEEP, false],
    [92, 300, 170, CY_SOFT, true],
    [114, 360, 160, CY, false],
  ];

  return (
    <Svg>
      <line x1={80} y1={18} x2={80} y2={134} stroke={LINE} />

      {rows.map(([y, x, w, color, milestone], i) => (
        <g key={y}>
          <rect x={24} y={y + 3} width={46} height={5} rx={2.5} fill={DIM} />
          <rect
            className="svc-grow"
            style={delay(i * 70)}
            x={x}
            y={y}
            width={w}
            height={12}
            rx={3}
            fill={color}
            opacity={0.85}
          />
          {milestone && (
            <path
              d={`M${x + w + 12},${y - 2} l8,8 l-8,8 l-8,-8 z`}
              fill={AM}
            />
          )}
        </g>
      ))}

      <line
        x1={300}
        y1={16}
        x2={300}
        y2={136}
        stroke={CY}
        strokeWidth={1.5}
        strokeDasharray="4 6"
        opacity={0.6}
        className="svc-dash"
      />
      <circle cx={300} cy={16} r={3.5} fill={CY} className="svc-pulse" />
    </Svg>
  );
}

/* 08 — Website Design & Build ---------------------------------------------- */
export function VisualWebsite() {
  return (
    <Svg>
      <rect x={24} y={20} width={512} height={110} rx={8} fill={FILL} stroke={LINE} />
      <path
        d="M24,28 a8,8 0 0 1 8,-8 h496 a8,8 0 0 1 8,8 v16 h-512 z"
        fill="#1A2634"
      />
      {[40, 54, 68].map((cx) => (
        <circle key={cx} cx={cx} cy={32} r={3.5} fill={DIM} />
      ))}
      <rect x={88} y={26} width={196} height={12} rx={6} fill={WELL} />
      <rect x={98} y={30} width={72} height={4} rx={2} fill={CY_DEEP} />

      <rect x={48} y={60} width={162} height={9} rx={3} fill={CY_SOFT} opacity={0.9} />
      <rect x={48} y={78} width={120} height={5} rx={2.5} fill={DIM} />
      <rect x={48} y={90} width={140} height={5} rx={2.5} fill={DIM} />
      <rect
        x={48}
        y={104}
        width={80}
        height={18}
        rx={4}
        fill={CY}
        opacity={0.9}
        className="svc-glow"
      />

      <rect x={244} y={58} width={148} height={64} rx={4} fill={WELL} stroke={LINE} />
      <path
        d="M256,110 l26,-28 l20,20 l18,-14 l28,22 z"
        fill={CY_DEEP}
        opacity={0.7}
      />
      <circle cx={272} cy={74} r={6} fill={CY_SOFT} opacity={0.8} />

      <g className="svc-rise">
        <rect x={418} y={64} width={100} height={30} rx={15} fill={WELL} stroke={CY_DEEP} />
        <path
          d="M436,71 l-7,10 h5 l-2,9 l8,-11 h-5 z"
          fill={AM}
        />
        <text
          x={484}
          y={84}
          textAnchor="middle"
          fontFamily={MONO}
          fontSize={14}
          fill={CY}
          className="svc-glow"
        >
          0.6s
        </text>
      </g>
    </Svg>
  );
}

/* 09 — Video Production & Brand Content ------------------------------------ */
export function VisualVideo() {
  const wave = [
    10, 17, 25, 14, 29, 20, 33, 18, 27, 12, 22, 30, 16, 24, 11, 19, 28, 15, 21, 9,
  ];

  return (
    <Svg>
      <rect x={24} y={16} width={512} height={76} rx={6} fill={WELL} stroke={LINE} />

      <g clipPath="url(#svcVideoClip)">
        <path d="M24,92 l86,-46 l60,30 l48,-24 l82,40 z" fill={CY_DEEP} opacity={0.3} />
        <path d="M232,92 l80,-36 l54,26 l66,-32 l104,42 z" fill={CY_DEEP} opacity={0.18} />
        <circle cx={456} cy={38} r={11} fill={AM} opacity={0.3} />
      </g>
      <defs>
        <clipPath id="svcVideoClip">
          <rect x={24} y={16} width={512} height={76} rx={6} />
        </clipPath>
      </defs>

      <g className="svc-rise">
        <circle cx={280} cy={54} r={21} fill="none" stroke={CY} strokeWidth={2} className="svc-glow" />
        <path d="M273,44 l17,10 l-17,10 z" fill={CY} />
      </g>

      <circle cx={40} cy={30} r={4} fill={RED} className="svc-pulse" />
      <text x={52} y={34} fontFamily={MONO} fontSize={9} letterSpacing={1.6} fill={CY_DEEP}>
        REC · 4K
      </text>

      <rect x={24} y={102} width={512} height={4} rx={2} fill={DIM} />
      <rect x={24} y={102} width={196} height={4} rx={2} fill={CY} className="svc-glow" />
      <circle cx={220} cy={104} r={6} fill={CY} />

      {wave.map((h, i) => (
        <rect
          key={i}
          className="svc-bar"
          style={delay(i * 28)}
          x={28 + i * 26}
          y={140 - h}
          width={9}
          height={h}
          rx={3}
          fill={i % 4 === 0 ? CY_SOFT : CY_DEEP}
          opacity={0.7}
        />
      ))}
    </Svg>
  );
}
