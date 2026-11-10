import { money, moneyCompact } from "../format";
import styles from "./finance.module.css";

/**
 * Twelve months of revenue vs expenses, with net as a line, on ONE dollar axis.
 * Server-rendered SVG; hover is pure CSS (each month is a group whose tooltip
 * shows on :hover/:focus), so it costs no client JS. Colours are validated
 * against the dark panel (#111823): revenue #0891D1, expenses #E84D8A, net in
 * the primary text ink.
 */

type Month = { key: string; label: string; revenue: number; expenses: number; net: number };

const W = 720;
const H = 240;
const PAD = { top: 16, right: 12, bottom: 26, left: 52 };

function niceMax(v: number): number {
  if (v <= 0) return 10_000; // $100 so an empty year still draws a sane axis
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / exp;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * exp;
}

export default function MonthlyChart({ months }: { months: Month[] }) {
  const top = niceMax(Math.max(...months.flatMap((m) => [m.revenue, m.expenses, m.net]), 0));
  const minNet = Math.min(...months.map((m) => m.net), 0);
  const bottom = minNet < 0 ? -niceMax(-minNet) : 0;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const y = (v: number) => PAD.top + ((top - v) / (top - bottom)) * plotH;
  const colW = plotW / months.length;
  const barW = Math.min(14, (colW - 10) / 2);
  const ticks = [top, top / 2, 0, ...(bottom < 0 ? [bottom] : [])];
  const cx = (i: number) => PAD.left + colW * i + colW / 2;
  const netPath = months.map((m, i) => `${i ? "L" : "M"}${cx(i).toFixed(1)},${y(m.net).toFixed(1)}`).join(" ");
  const empty = months.every((m) => !m.revenue && !m.expenses);

  // A bar from the zero line to v, rounded only at the data end (4px).
  const bar = (x: number, v: number) => {
    if (v <= 0) return null;
    const y0 = y(0);
    const y1 = y(v);
    const h = Math.max(y0 - y1, 1.5);
    const r = Math.min(4, h, barW / 2);
    return `M${x},${y0} V${y0 - h + r} Q${x},${y0 - h} ${x + r},${y0 - h} H${x + barW - r} Q${x + barW},${y0 - h} ${x + barW},${y0 - h + r} V${y0} Z`;
  };

  return (
    <div className={styles.chartWrap}>
      <div className={styles.legend} aria-hidden>
        <span><i className={styles.swRevenue} />Revenue</span>
        <span><i className={styles.swExpenses} />Expenses</span>
        <span><i className={styles.swNet} />Net</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.chart} role="img" aria-label={`Revenue, expenses and net by month, ${months[0].label} to ${months.at(-1)!.label}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className={t === 0 ? styles.zero : styles.grid} />
            <text x={PAD.left - 8} y={y(t) + 3.5} className={styles.axisText} textAnchor="end">{moneyCompact(t)}</text>
          </g>
        ))}
        {months.map((m, i) => (
          <text key={m.key} x={cx(i)} y={H - 8} className={styles.axisText} textAnchor="middle">{m.label}</text>
        ))}
        {months.map((m, i) => {
          const x0 = cx(i) - barW - 1; // 2px gap between the pair
          return (
            <g key={m.key}>
              <path d={bar(x0, m.revenue) ?? ""} className={styles.barRevenue} />
              <path d={bar(x0 + barW + 2, m.expenses) ?? ""} className={styles.barExpenses} />
            </g>
          );
        })}
        {!empty ? <path d={netPath} className={styles.netLine} /> : null}
        {!empty ? months.map((m, i) => <circle key={m.key} cx={cx(i)} cy={y(m.net)} r={4} className={styles.netDot} />) : null}
        {/* Hover layer: a full-height hit column per month with its tooltip. */}
        {months.map((m, i) => {
          const tipW = 150;
          const tx = Math.min(Math.max(cx(i) - tipW / 2, PAD.left), W - PAD.right - tipW);
          return (
            <g key={m.key} className={styles.hit} tabIndex={0} aria-label={`${m.label}: revenue ${money(m.revenue)}, expenses ${money(m.expenses)}, net ${money(m.net)}`}>
              <rect x={PAD.left + colW * i} y={PAD.top} width={colW} height={plotH} className={styles.hitRect} />
              <line x1={cx(i)} x2={cx(i)} y1={PAD.top} y2={PAD.top + plotH} className={styles.crosshair} />
              <g className={styles.tip}>
                <rect x={tx} y={PAD.top + 2} width={tipW} height={66} rx={7} className={styles.tipBox} />
                <text x={tx + 10} y={PAD.top + 19} className={styles.tipHead}>{m.label} {m.key.slice(0, 4)}</text>
                <text x={tx + 10} y={PAD.top + 35} className={styles.tipText}><tspan className={styles.tipRev}>■</tspan> Revenue {money(m.revenue)}</text>
                <text x={tx + 10} y={PAD.top + 49} className={styles.tipText}><tspan className={styles.tipExp}>■</tspan> Expenses {money(m.expenses)}</text>
                <text x={tx + 10} y={PAD.top + 63} className={styles.tipText}>— Net {money(m.net)}</text>
              </g>
            </g>
          );
        })}
      </svg>
      {empty ? <p className={styles.chartEmpty}>No money has been recorded in the last 12 months yet. Paid Stripe invoices, manual payments and expenses will draw here automatically.</p> : null}
      <details className={styles.table}>
        <summary>View as table</summary>
        <table>
          <thead><tr><th>Month</th><th>Revenue</th><th>Expenses</th><th>Net</th></tr></thead>
          <tbody>{months.map((m) => <tr key={m.key}><td>{m.label} {m.key.slice(0, 4)}</td><td>{money(m.revenue)}</td><td>{money(m.expenses)}</td><td className={m.net < 0 ? styles.neg : ""}>{money(m.net)}</td></tr>)}</tbody>
        </table>
      </details>
    </div>
  );
}
