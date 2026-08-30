/**
 * The four chart shapes the Clients screen needs.
 *
 * All server-rendered SVG and CSS — no charting library, no client JS. Hover
 * detail comes from native <title> elements, which is enough at this density
 * and costs nothing.
 *
 * Two rules run through all of them:
 *   1. Every value is written out as text. Colour is a reminder of which row
 *      is which, never the only way to read the chart.
 *   2. Labels and numbers wear text tokens. Only the small key square carries
 *      the series colour.
 */

export type Slice = { label: string; value: number; share: number };

/**
 * Composition around a hero total.
 *
 * The angles are deliberately not what you read this with — the legend beside
 * it carries the value and the share for every slice. The ring is there to
 * show that the total is made of parts, and roughly of what size.
 */
export function Donut({
  slices,
  total,
  caption,
  format,
  size = 128,
  stroke = 15,
}: {
  slices: Slice[];
  total: string;
  caption: string;
  format: (value: number) => string;
  size?: number;
  stroke?: number;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  // A 2px gap of the panel surface between segments, so neighbouring arcs
  // never blend into one another. One lone slice gets no gap — a full ring
  // with a notch in it looks like a rendering fault.
  const gap = slices.length > 1 ? 2 : 0;

  // Each arc starts where the shares before it end. Computed from the slices
  // rather than carried in an accumulator, so the map stays pure — at most
  // eight slices, so the prefix sum costs nothing.
  const arcs = slices.map((slice, i) => {
    const before = slices.slice(0, i).reduce((total, s) => total + s.share, 0);
    const length = Math.max(slice.share * circumference - gap, 0);
    return {
      key: slice.label,
      color: `var(--cc-cat-${(i % 8) + 1})`,
      dash: `${length} ${circumference - length}`,
      offset: -before * circumference,
      title: `${slice.label}: ${format(slice.value)} (${Math.round(slice.share * 100)}%)`,
    };
  });

  return (
    <div className="cc-donut" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`Total ${total} split across ${slices.length} service lines`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.055)"
          strokeWidth={stroke}
        />
        {arcs.map((arc) => (
          <circle
            key={arc.key}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={arc.color}
            strokeWidth={stroke}
            strokeDasharray={arc.dash}
            strokeDashoffset={arc.offset}
          >
            <title>{arc.title}</title>
          </circle>
        ))}
      </svg>
      <div className="cc-donut-centre">
        <span className="cc-donut-total">{total}</span>
        <span className="cc-donut-caption">{caption}</span>
      </div>
    </div>
  );
}

export function Legend({
  slices,
  format,
  showShare = true,
}: {
  slices: Slice[];
  format: (value: number) => string;
  showShare?: boolean;
}) {
  return (
    <div className="cc-legend">
      {slices.map((slice, i) => (
        <div key={slice.label} className={`cc-legend-row cc-cat-${(i % 8) + 1}`}>
          <span className="cc-legend-key" aria-hidden="true" />
          <span className="cc-legend-label">{slice.label}</span>
          <span className="cc-legend-value">{format(slice.value)}</span>
          {showShare ? (
            <span className="cc-legend-share">({Math.round(slice.share * 100)}%)</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/**
 * A single account's health, 0-100.
 *
 * The number is the encoding; the colour repeats it. Someone who cannot tell
 * the green ring from the amber one still reads 92 and 47.
 */
export function HealthRing({
  score,
  band,
  untested,
  size = 34,
}: {
  score: number;
  band: "excellent" | "good" | "average" | "poor";
  untested?: boolean;
  size?: number;
}) {
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (Math.max(0, Math.min(100, score)) / 100) * circumference;

  return (
    <span
      className={`cc-ring ${untested ? "is-untested" : ""}`}
      style={{ width: size, height: size }}
      title={
        untested
          ? `${score} — nothing has gone wrong, but nothing has been measured either`
          : `Health ${score} out of 100`
      }
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.09)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={untested ? "rgba(255,255,255,0.22)" : `var(--cc-band-${band})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference - filled}`}
        />
      </svg>
      <span className="cc-ring-n">{score}</span>
    </span>
  );
}

const STAR = "M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.4-5.8-3-5.8 3 1.1-6.4L2.6 9.4l6.5-.9L12 2.6Z";

export function Stars({ rating, size = 12 }: { rating: number | null; size?: number }) {
  if (rating === null) return <span className="cc-stars-none">not asked</span>;

  return (
    <span className="cc-stars" title={`${rating} out of 5`} role="img" aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg
          key={n}
          width={size}
          height={size}
          viewBox="0 0 24 24"
          className={n <= rating ? "" : "is-empty"}
          fill="currentColor"
          aria-hidden="true"
        >
          <path d={STAR} />
        </svg>
      ))}
    </span>
  );
}

export type BarRow = {
  label: string;
  value: number;
  share: number;
  valueLabel?: string;
  href?: string;
};

/** Magnitude across a handful of named things. One series, so no legend. */
export function BarList({
  rows,
  showShare = true,
  color,
}: {
  rows: BarRow[];
  showShare?: boolean;
  color?: string;
}) {
  const max = Math.max(...rows.map((r) => r.share), 0.0001);

  return (
    <div className="cc-barlist">
      {rows.map((row) => (
        <div key={row.label} className="cc-barrow">
          <span className="cc-barrow-label" title={row.label}>
            {row.label}
          </span>
          <span className="cc-barrow-track">
            <span
              className="cc-barrow-fill"
              style={{
                width: `${Math.max((row.share / max) * 100, 2)}%`,
                ...(color ? { background: color } : {}),
              }}
            />
          </span>
          <span>
            <span className="cc-barrow-value">{row.valueLabel ?? row.value}</span>
            {showShare ? (
              <span className="cc-barrow-share"> ({Math.round(row.share * 100)}%)</span>
            ) : null}
          </span>
        </div>
      ))}
    </div>
  );
}
