/**
 * One bar chart, reused by every panel that needs one.
 *
 * Deliberately not a charting library: this is thirty divs with a height, it
 * renders on the server, it costs nothing, and it is the only chart shape the
 * dashboard actually needs.
 */
export default function MiniBars({
  points,
  labelLeft,
  labelRight,
  format,
}: {
  points: { key: string; value: number }[];
  labelLeft?: string;
  labelRight?: string;
  format?: (value: number, key: string) => string;
}) {
  const max = Math.max(...points.map((p) => p.value), 1);

  return (
    <>
      <div className="cc-chart" role="img" aria-label={`${points.length} day trend`}>
        {points.map((p) => (
          <span
            key={p.key}
            className={`cc-bar ${p.value === 0 ? "is-empty" : ""}`}
            style={{ height: `${p.value === 0 ? 3 : Math.max((p.value / max) * 100, 6)}%` }}
            title={format ? format(p.value, p.key) : `${p.key}: ${p.value}`}
          />
        ))}
      </div>
      {labelLeft || labelRight ? (
        <div className="cc-chart-axis">
          <span>{labelLeft}</span>
          <span>{labelRight}</span>
        </div>
      ) : null}
    </>
  );
}
