"use client";

import { useEffect, useRef, useState } from "react";
import { IconBot, IconSparkle } from "@/components/Icons";
import { useReducedMotion } from "@/components/fx/useReducedMotion";

/**
 * Representative business dashboard.
 *
 * Drawn entirely in markup + SVG — no image payload, and it recolours with the
 * theme. Figures are illustrative sample data, not a real client account.
 *
 * It plays itself once when scrolled into view: counters run up, the sales line
 * draws left to right, the donut fills, and the assistant types a prompt. Under
 * `prefers-reduced-motion` everything renders at its final state immediately.
 */

const DASH_NAV = [
  "Dashboard",
  "Leads",
  "Customers",
  "Orders",
  "Calendar",
  "Products",
  "Marketing",
  "Reports",
  "Automations",
  "Settings",
];

const DASH_KPIS = [
  { label: "New leads", value: 128, delta: "+24%", prefix: "" },
  { label: "Sales", value: 24560, delta: "+18%", prefix: "$" },
  { label: "Orders", value: 84, delta: "+12%", prefix: "" },
  { label: "Revenue", value: 96430, delta: "+11%", prefix: "$" },
];

const DASH_SOURCES = [
  { name: "Website", pct: 42, color: "#3B82F6" },
  { name: "Facebook", pct: 28, color: "#6366F1" },
  { name: "Instagram", pct: 15, color: "#8B5CF6" },
  { name: "Google", pct: 10, color: "#22C55E" },
  { name: "Other", pct: 5, color: "#475569" },
];

const DASH_APPTS = [
  { time: "10:00 AM", title: "Pool estimate", who: "Sarah Johnson" },
  { time: "1:00 PM", title: "Consultation call", who: "Mike Reyes" },
  { time: "3:30 PM", title: "Site visit", who: "Dana Whitfield" },
];

const ACTIVITY = [
  { dot: "var(--color-success)", text: "New lead from website", time: "2 min ago" },
  { dot: "var(--color-amber)", text: "New order #1234", time: "18 min ago" },
  { dot: "var(--color-blue)", text: "Invoice paid — Mintline", time: "1 hr ago" },
];

const ASSISTANT_PROMPT = "Summarize this week and flag anything slipping.";

/** Runs 0 → 1 once the element is on screen. Skipped under reduced motion. */
function useReveal<T extends HTMLElement>(durationMs = 1400) {
  const ref = useRef<T>(null);
  const reduced = useReducedMotion();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;

    let frame = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        const start = performance.now();
        const step = (now: number) => {
          const p = Math.min(1, (now - start) / durationMs);
          setProgress(easeOutCubic(p));
          if (p < 1) frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
      },
      { threshold: 0.25 }
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [durationMs, reduced]);

  // Reduced motion jumps straight to the finished state — no animation at all.
  return { ref, t: reduced ? 1 : progress };
}

function easeOutCubic(p: number) {
  return 1 - Math.pow(1 - p, 3);
}

export function CommandCenter() {
  const { ref, t } = useReveal<HTMLDivElement>(1500);
  const typed = useTypewriter(ASSISTANT_PROMPT, t > 0.55);

  return (
    <div ref={ref} className="tt-dash" aria-label="Representative business dashboard">
      <div className="grid grid-cols-[124px_minmax(0,1fr)] md:grid-cols-[150px_minmax(0,1fr)]">
        {/* Sidebar */}
        <aside className="tt-dash-side p-3 hidden sm:block">
          <div className="flex items-center gap-2 px-1.5 pb-4 mb-2 border-b border-[color:var(--color-border-subtle)]">
            <span className="w-4 h-4 rounded bg-[color:var(--color-blue)]" />
            <span className="text-[9.5px] font-bold tracking-[0.06em] uppercase truncate">
              Tomorrow&rsquo;s Tech
            </span>
          </div>
          <nav className="space-y-0.5">
            {DASH_NAV.map((item, i) => (
              <div key={item} className="tt-dash-nav" data-active={i === 0}>
                <span className="w-1.5 h-1.5 rounded-sm bg-current opacity-70 shrink-0" />
                <span className="truncate">{item}</span>
              </div>
            ))}
          </nav>
        </aside>

        {/* Main */}
        <div className="p-3.5 md:p-5 col-span-2 sm:col-span-1">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <div className="text-[14px] md:text-[16px] font-semibold">Welcome back, John</div>
              <div className="text-[11px] text-[color:var(--color-text-muted)] mt-0.5">
                Here&apos;s what&apos;s happening in your business today.
              </div>
            </div>
            <div className="hidden md:flex items-center gap-2 text-[10px] text-[color:var(--color-text-muted)] border border-[color:var(--color-border-subtle)] rounded-md px-2.5 py-1.5">
              Quick actions
            </div>
          </div>

          {/* KPI row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-2">
            {DASH_KPIS.map(({ label, value, delta, prefix }) => (
              <div key={label} className="tt-dash-panel tt-dash-kpi">
                <span>{label}</span>
                <strong className="tabular-nums">
                  {prefix}
                  {Math.round(value * t).toLocaleString("en-US")}
                </strong>
                <div
                  className="text-[9.5px] text-[color:var(--color-success)] mt-1 whitespace-nowrap transition-opacity duration-500"
                  style={{ opacity: t > 0.75 ? 1 : 0 }}
                >
                  {delta} <span className="text-[color:var(--color-text-muted)]">vs 7 days</span>
                </div>
              </div>
            ))}
          </div>

          {/* Charts row */}
          <div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1.05fr)] gap-2 mb-2">
            <div className="tt-dash-panel">
              <div className="text-[10.5px] font-medium mb-2">Sales overview</div>
              <SalesChart t={t} />
            </div>

            <div className="tt-dash-panel">
              <div className="text-[10.5px] font-medium mb-2">Leads by source</div>
              <div className="flex items-center gap-3">
                <Donut t={t} />
                <ul className="space-y-1 min-w-0">
                  {DASH_SOURCES.map((s, i) => (
                    <li
                      key={s.name}
                      className="flex items-center gap-1.5 text-[9.5px] whitespace-nowrap transition-opacity duration-300"
                      style={{ opacity: t > 0.3 + i * 0.1 ? 1 : 0 }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: s.color }}
                      />
                      <span className="text-[color:var(--color-text-secondary)] truncate">
                        {s.name}
                      </span>
                      <span className="text-[color:var(--color-text-muted)] ml-auto">{s.pct}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="tt-dash-panel">
              <div className="text-[10.5px] font-medium mb-2">Upcoming appointments</div>
              <ul className="space-y-2">
                {DASH_APPTS.map((a, i) => (
                  <li
                    key={a.time}
                    className="flex items-start gap-2 transition-all duration-500"
                    style={{
                      opacity: t > 0.35 + i * 0.12 ? 1 : 0,
                      transform: t > 0.35 + i * 0.12 ? "none" : "translateY(4px)",
                    }}
                  >
                    <span className="text-[9.5px] font-medium text-[color:var(--color-blue)] w-[52px] shrink-0 pt-px">
                      {a.time}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[10.5px] truncate">{a.title}</span>
                      <span className="block text-[9.5px] text-[color:var(--color-text-muted)] truncate">
                        {a.who}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Activity + assistant */}
          <div className="grid lg:grid-cols-2 gap-2">
            <div className="tt-dash-panel">
              <div className="text-[10.5px] font-medium mb-2.5">Recent activity</div>
              <ul className="space-y-2">
                {ACTIVITY.map((row, i) => (
                  <li
                    key={row.text}
                    className="flex items-center gap-2 text-[10.5px] transition-all duration-500"
                    style={{
                      opacity: t > 0.45 + i * 0.12 ? 1 : 0,
                      transform: t > 0.45 + i * 0.12 ? "none" : "translateX(-6px)",
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: row.dot }}
                    />
                    <span className="truncate">{row.text}</span>
                    <span className="ml-auto text-[9.5px] text-[color:var(--color-text-muted)] shrink-0">
                      {row.time}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="tt-dash-panel !bg-[rgba(59,130,246,0.07)] !border-[rgba(59,130,246,0.28)]">
              <div className="flex items-center gap-1.5 text-[10.5px] font-medium text-[color:var(--color-blue-bright)] mb-2.5">
                <IconSparkle size={13} />
                AI assistant
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-bg)]/60 px-2.5 py-2 text-[10.5px] min-h-[30px]">
                  <span className={typed ? "text-[color:var(--color-text)]" : "text-[color:var(--color-text-muted)]"}>
                    {typed || "What would you like to do today?"}
                  </span>
                  {typed && typed.length < ASSISTANT_PROMPT.length && (
                    <span className="tt-caret" aria-hidden="true" />
                  )}
                </div>
                <span className="tt-icon-tile !w-8 !h-8 !rounded-lg">
                  <IconBot size={15} />
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {["Summarize this week", "Draft follow-ups", "Flag stale leads"].map((chip, i) => (
                  <span
                    key={chip}
                    className="text-[9px] rounded-full border border-[color:var(--color-border-subtle)] px-2 py-1 text-[color:var(--color-text-secondary)] transition-opacity duration-500"
                    style={{ opacity: t > 0.6 + i * 0.1 ? 1 : 0 }}
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Types `text` out once `start` flips true. */
function useTypewriter(text: string, start: boolean) {
  const reduced = useReducedMotion();
  const [out, setOut] = useState("");

  useEffect(() => {
    if (!start || reduced) return;
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setOut(text.slice(0, i));
      if (i >= text.length) window.clearInterval(id);
    }, 34);
    return () => window.clearInterval(id);
  }, [text, start, reduced]);

  return reduced && start ? text : out;
}

/* ── Charts ─────────────────────────────────────────────────────────────── */

const POINTS = [26, 34, 30, 44, 38, 52, 47, 63, 58, 72, 66, 80];
const CHART_W = 260;
const CHART_H = 76;

function SalesChart({ t }: { t: number }) {
  const step = CHART_W / (POINTS.length - 1);
  const coords = POINTS.map((p, i) => [i * step, CHART_H - (p / 90) * CHART_H] as const);
  const line = coords
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${CHART_W} ${CHART_H} L0 ${CHART_H} Z`;
  const last = coords[coords.length - 1];

  return (
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full h-auto" aria-hidden="true">
      <defs>
        <linearGradient id="tt-sales-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line
          key={f}
          x1="0"
          y1={CHART_H * f}
          x2={CHART_W}
          y2={CHART_H * f}
          stroke="currentColor"
          strokeWidth="0.5"
          className="text-[color:var(--color-border-subtle)]"
        />
      ))}
      <path d={area} fill="url(#tt-sales-fill)" opacity={t} />
      {/* pathLength normalises the dash maths regardless of the real path length */}
      <path
        d={line}
        fill="none"
        stroke="#60A5FA"
        strokeWidth="1.8"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray="1"
        strokeDashoffset={1 - t}
      />
      <circle cx={last[0]} cy={last[1]} r="3" fill="#60A5FA" opacity={t > 0.96 ? 1 : 0} />
    </svg>
  );
}

const DONUT_R = 22;
const DONUT_C = 2 * Math.PI * DONUT_R;
const DONUT_ARCS = DASH_SOURCES.map((s, i) => ({
  ...s,
  len: (s.pct / 100) * DONUT_C,
  start: DASH_SOURCES.slice(0, i).reduce((sum, p) => sum + (p.pct / 100) * DONUT_C, 0),
}));

function Donut({ t }: { t: number }) {
  return (
    <svg viewBox="0 0 60 60" className="w-[62px] h-[62px] shrink-0 -rotate-90" aria-hidden="true">
      <circle cx="30" cy="30" r={DONUT_R} fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth="9" />
      {DONUT_ARCS.map((arc) => {
        const drawn = Math.max(0, Math.min(arc.len, DONUT_C * t - arc.start));
        return (
          <circle
            key={arc.name}
            cx="30"
            cy="30"
            r={DONUT_R}
            fill="none"
            stroke={arc.color}
            strokeWidth="9"
            strokeDasharray={`${drawn} ${DONUT_C - drawn}`}
            strokeDashoffset={-arc.start}
          />
        );
      })}
    </svg>
  );
}
