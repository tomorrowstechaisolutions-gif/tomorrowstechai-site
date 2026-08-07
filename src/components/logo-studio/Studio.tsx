"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import {
  FONTS,
  INDUSTRIES,
  PALETTES,
  PALETTE_BY_ID,
  STYLES,
  USAGE,
} from "@/lib/logo-studio/data";
import { CONCEPTS_PER_ROUND, emptyBrief, generateConcepts } from "@/lib/logo-studio/generate";
import { renderLogoSvg } from "@/lib/logo-studio/render";
import { buildBrandKit, downloadBlob } from "@/lib/logo-studio/export";
import type { Brief, Concept, Palette } from "@/lib/logo-studio/types";
import { Mockups } from "./Mockups";
import { IconArrowRight, IconBadgeCheck, IconSparkle } from "@/components/Icons";

/**
 * The Logo Studio wizard.
 *
 * Everything runs client-side against the parametric engine — no API call, no
 * per-generation cost, and results appear instantly. State is deliberately flat
 * and local: this is a single-session tool, and persisting it would mean
 * accounts, which is a later decision.
 */

const STEPS = [
  { n: 1, title: "Business info", hint: "Tell us about your business" },
  { n: 2, title: "Style preferences", hint: "Choose your look & feel" },
  { n: 3, title: "Logo concepts", hint: "Choose your favorite" },
  { n: 4, title: "Customize", hint: "Refine your logo" },
  { n: 5, title: "Brand kit", hint: "Download your assets" },
];

export function Studio() {
  const [step, setStep] = useState(1);
  const [brief, setBrief] = useState<Brief>(emptyBrief);
  const [rounds, setRounds] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [overridePalette, setOverridePalette] = useState<string | null>(null);
  const [overrideFont, setOverrideFont] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const concepts = useMemo(() => {
    if (!brief.businessName.trim()) return [];
    return Array.from({ length: rounds }, (_, r) => generateConcepts(brief, r)).flat();
  }, [brief, rounds]);

  const selected = concepts.find((c) => c.id === selectedId) ?? concepts[0] ?? null;

  // Customise step edits are applied on top of the concept rather than baked in,
  // so switching concepts keeps the customer's colour and type choices.
  const activeConcept: Concept | null = useMemo(() => {
    if (!selected) return null;
    return overrideFont ? { ...selected, font: FONTS.find((f) => f.id === overrideFont) ?? selected.font } : selected;
  }, [selected, overrideFont]);

  const activePalette: Palette | null = activeConcept
    ? overridePalette
      ? PALETTE_BY_ID[overridePalette] ?? activeConcept.palette
      : activeConcept.palette
    : null;

  const set = useCallback(<K extends keyof Brief>(k: K, v: Brief[K]) => {
    setBrief((b) => ({ ...b, [k]: v }));
    setSelectedId(null);
    setRounds(1);
  }, []);

  const toggleIn = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  const canAdvance =
    step === 1 ? brief.businessName.trim().length >= 2 : step === 2 ? brief.styles.length > 0 : true;

  const download = async () => {
    if (!activeConcept || !activePalette) return;
    setBusy(true);
    try {
      const { blob, filename } = await buildBrandKit(activeConcept, brief, activePalette);
      downloadBlob(blob, filename);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-[240px_minmax(0,1fr)_290px] gap-5 items-start">
      {/* ── Step rail ──────────────────────────────────────────────── */}
      <aside className="tt-glass p-5 lg:sticky lg:top-24">
        <div className="text-[10.5px] font-semibold tracking-[0.2em] uppercase text-[color:var(--color-text-muted)] mb-5">
          Logo creator
        </div>
        <ol className="space-y-1">
          {STEPS.map((s) => {
            const done = s.n < step;
            const active = s.n === step;
            const reachable = s.n <= step || (s.n <= 3 && brief.businessName.trim().length >= 2);
            return (
              <li key={s.n}>
                <button
                  type="button"
                  disabled={!reachable}
                  onClick={() => setStep(s.n)}
                  className={`w-full text-left flex gap-3 items-start px-3 py-2.5 rounded-lg transition-colors ${
                    active ? "bg-[rgba(59,130,246,0.13)]" : reachable ? "hover:bg-white/[0.04]" : "opacity-40"
                  }`}
                >
                  <span
                    className={`w-6 h-6 rounded-full grid place-items-center text-[11px] font-bold shrink-0 mt-px ${
                      active
                        ? "bg-[color:var(--color-blue)] text-white"
                        : done
                          ? "bg-[rgba(59,130,246,0.22)] text-[color:var(--color-blue-bright)]"
                          : "border border-[color:var(--color-border)] text-[color:var(--color-text-muted)]"
                    }`}
                  >
                    {done ? "✓" : s.n}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold leading-tight">{s.title}</span>
                    <span className="block text-[11px] text-[color:var(--color-text-muted)] mt-0.5">{s.hint}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        {brief.businessName && (
          <div className="mt-6 pt-5 border-t border-[color:var(--color-border-subtle)]">
            <div className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[color:var(--color-text-muted)] mb-3">
              Your preferences
            </div>
            <Meta label="Business name" value={brief.businessName} />
            <Meta label="Industry" value={INDUSTRIES.find((i) => i.id === brief.industryId)?.name ?? ""} />
            <div className="mt-3">
              <div className="text-[10px] text-[color:var(--color-text-muted)] mb-1.5">Style</div>
              <div className="flex flex-wrap gap-1.5">
                {brief.styles.map((s) => (
                  <span key={s} className="text-[10px] rounded-md border border-[color:var(--color-border)] px-2 py-1">
                    {STYLES.find((x) => x.id === s)?.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 rounded-xl border border-[rgba(59,130,246,0.3)] bg-[rgba(59,130,246,0.07)] p-4">
          <div className="text-[12px] font-semibold mb-1">Want a custom design?</div>
          <p className="text-[11.5px] text-[color:var(--color-text-secondary)] leading-relaxed mb-3">
            Our designers will hand-craft a 100% original logo for your brand.
          </p>
          <Link href="/contact" className="btn-secondary w-full justify-center text-[11px] uppercase tracking-[0.1em]">
            Custom logo package
          </Link>
        </div>
      </aside>

      {/* ── Main panel ─────────────────────────────────────────────── */}
      <section className="min-w-0">
        {step === 1 && (
          <Panel title="Tell us about your business" sub="Two fields is all we need to start.">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Business name" required>
                <input
                  value={brief.businessName}
                  onChange={(e) => set("businessName", e.target.value.slice(0, 28))}
                  placeholder="Summit Electric"
                  className="tt-input"
                  autoFocus
                />
              </Field>
              <Field label="Tagline or descriptor" hint="Optional — sits under the name">
                <input
                  value={brief.descriptor}
                  onChange={(e) => set("descriptor", e.target.value.slice(0, 24))}
                  placeholder="Electrical Contracting"
                  className="tt-input"
                />
              </Field>
            </div>

            <Field label="Industry" className="mt-6">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {INDUSTRIES.map((ind) => (
                  <Choice
                    key={ind.id}
                    on={brief.industryId === ind.id}
                    onClick={() => set("industryId", ind.id)}
                  >
                    {ind.name}
                  </Choice>
                ))}
              </div>
            </Field>
          </Panel>
        )}

        {step === 2 && (
          <Panel title="What should your company feel like?" sub="Pick two or three. This drives the shapes and type we reach for.">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {STYLES.map((s) => (
                <Choice key={s.id} on={brief.styles.includes(s.id)} onClick={() => set("styles", toggleIn(brief.styles, s.id))}>
                  <span className="block font-semibold">{s.label}</span>
                  <span className="block text-[11px] text-[color:var(--color-text-muted)] mt-0.5">{s.hint}</span>
                </Choice>
              ))}
            </div>

            <Field label="Colour direction" className="mt-7">
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {PALETTES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => set("paletteId", p.id)}
                    className={`rounded-lg border p-2.5 text-left transition-colors ${
                      brief.paletteId === p.id
                        ? "border-[color:var(--color-blue)] bg-[rgba(59,130,246,0.09)]"
                        : "border-[color:var(--color-border)] hover:border-white/25"
                    }`}
                  >
                    <span className="flex gap-1 mb-2">
                      {[p.primary, p.secondary, p.deep].map((c) => (
                        <span key={c} className="h-6 flex-1 rounded" style={{ background: c }} />
                      ))}
                    </span>
                    <span className="text-[11.5px] font-medium">{p.name}</span>
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Where will this logo be used?" className="mt-7">
              <div className="grid sm:grid-cols-3 gap-2">
                {USAGE.map((u) => (
                  <Choice key={u.id} on={brief.usage.includes(u.id)} onClick={() => set("usage", toggleIn(brief.usage, u.id))}>
                    {u.label}
                  </Choice>
                ))}
              </div>
            </Field>
          </Panel>
        )}

        {step === 3 && (
          <Panel
            title="Choose your favorite concepts"
            sub={`We've created these concepts from your brief. Click one to select it.`}
            action={
              <button
                type="button"
                onClick={() => setRounds((r) => r + 1)}
                className="btn-secondary text-[11.5px] uppercase tracking-[0.1em]"
              >
                <IconSparkle size={14} />
                Generate more
              </button>
            }
          >
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {concepts.map((c) => (
                <ConceptCard
                  key={c.id}
                  concept={c}
                  brief={brief}
                  selected={(selected?.id ?? "") === c.id}
                  favorite={favorites.includes(c.id)}
                  onSelect={() => {
                    setSelectedId(c.id);
                    setOverridePalette(null);
                    setOverrideFont(null);
                  }}
                  onFavorite={() => setFavorites((f) => toggleIn(f, c.id))}
                />
              ))}
            </div>
            <p className="text-[11.5px] text-[color:var(--color-text-muted)] mt-4 text-center">
              Showing {concepts.length} concepts · {CONCEPTS_PER_ROUND} more each time you generate
            </p>
          </Panel>
        )}

        {step === 4 && activeConcept && activePalette && (
          <Panel title="Refine your logo" sub="Change the colour system and typeface. Everything updates live.">
            <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-8 grid place-items-center min-h-[220px] mb-6">
              <LogoBlock concept={activeConcept} brief={brief} palette={activePalette} ns="preview" />
            </div>

            <Field label="Colour system">
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {PALETTES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setOverridePalette(p.id)}
                    className={`rounded-lg border p-2 transition-colors ${
                      activePalette.id === p.id
                        ? "border-[color:var(--color-blue)] bg-[rgba(59,130,246,0.09)]"
                        : "border-[color:var(--color-border)] hover:border-white/25"
                    }`}
                  >
                    <span className="flex gap-1 mb-1.5">
                      {[p.primary, p.secondary, p.deep].map((c) => (
                        <span key={c} className="h-5 flex-1 rounded" style={{ background: c }} />
                      ))}
                    </span>
                    <span className="text-[10.5px]">{p.name}</span>
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Typeface" className="mt-6">
              <div className="grid sm:grid-cols-3 gap-2">
                {FONTS.map((f) => (
                  <Choice key={f.id} on={activeConcept.font.id === f.id} onClick={() => setOverrideFont(f.id)}>
                    <span style={{ fontFamily: f.stack, fontWeight: f.nameWeight }} className="block text-[17px]">
                      Aa
                    </span>
                    <span className="block text-[11px] text-[color:var(--color-text-muted)] mt-0.5">{f.name}</span>
                  </Choice>
                ))}
              </div>
            </Field>
          </Panel>
        )}

        {step === 5 && activeConcept && activePalette && (
          <Panel title="See your brand alive" sub="This is your logo working across the places your customers will actually meet it.">
            <Mockups concept={activeConcept} brief={brief} palette={activePalette} />
            <BrandKitCta busy={busy} onDownload={download} />
          </Panel>
        )}

        {/* ── Step nav ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 mt-6">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1}
            className="btn-secondary text-[12px] uppercase tracking-[0.1em] disabled:opacity-35 disabled:pointer-events-none"
          >
            Back
          </button>
          {step < 5 && (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(5, s + 1))}
              disabled={!canAdvance}
              className="btn-primary text-[12px] uppercase tracking-[0.1em] disabled:opacity-35 disabled:pointer-events-none"
              data-magnetic
            >
              {step === 2 ? "Generate concepts" : "Continue"}
              <IconArrowRight size={15} />
            </button>
          )}
        </div>
      </section>

      {/* ── Selected panel ─────────────────────────────────────────── */}
      <aside className="tt-glass p-5 lg:sticky lg:top-24">
        <div className="text-[10.5px] font-semibold tracking-[0.2em] uppercase text-[color:var(--color-text-muted)] mb-4">
          Selected logo
        </div>
        <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-5 grid place-items-center min-h-[150px]">
          {activeConcept && activePalette ? (
            <LogoBlock concept={activeConcept} brief={brief} palette={activePalette} ns="sel" />
          ) : (
            <p className="text-[11.5px] text-[color:var(--color-text-muted)] text-center">
              Enter your business name to see concepts.
            </p>
          )}
        </div>

        {activeConcept && activePalette && (
          <>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <button type="button" onClick={() => setStep(4)} className="btn-primary justify-center text-[11px] uppercase tracking-[0.09em]">
                Customize
              </button>
              <button type="button" onClick={() => setStep(5)} className="btn-secondary justify-center text-[11px] uppercase tracking-[0.09em]">
                Mockups
              </button>
            </div>

            <div className="mt-6">
              <div className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[color:var(--color-text-muted)] mb-2.5">
                Brand colors
              </div>
              <div className="flex gap-2">
                {[activePalette.primary, activePalette.secondary, activePalette.deep, activePalette.light].map((c) => (
                  <div key={c} className="flex-1">
                    <div className="h-10 rounded-lg border border-white/10" style={{ background: c }} />
                    <div className="text-[8.5px] text-[color:var(--color-text-muted)] mt-1 text-center">{c}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6">
              <div className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[color:var(--color-text-muted)] mb-2.5">
                Typography
              </div>
              <div className="flex items-center gap-3">
                <span style={{ fontFamily: activeConcept.font.stack, fontWeight: activeConcept.font.nameWeight }} className="text-[26px] leading-none">
                  Aa
                </span>
                <div className="min-w-0">
                  <div className="text-[12px] font-semibold truncate">{activeConcept.font.name}</div>
                  <div className="text-[10.5px] text-[color:var(--color-text-muted)]">
                    Weight {activeConcept.font.nameWeight} / {activeConcept.font.subWeight}
                  </div>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={download}
              disabled={busy}
              className="btn-primary w-full justify-center mt-6 text-[11.5px] uppercase tracking-[0.1em] disabled:opacity-60"
            >
              {busy ? "Building kit…" : "Download brand kit"}
            </button>
            <p className="text-[10px] text-[color:var(--color-text-muted)] text-center mt-2">
              SVG, PNG, icons, colours &amp; brand guide
            </p>
          </>
        )}
      </aside>
    </div>
  );
}

/* ── Pieces ─────────────────────────────────────────────────────────── */

function LogoBlock({
  concept,
  brief,
  palette,
  ns,
  onLight = false,
}: {
  concept: Concept;
  brief: Brief;
  palette: Palette;
  ns: string;
  onLight?: boolean;
}) {
  const svg = renderLogoSvg(concept, brief, { palette, onLight, ns });
  return (
    <span
      className="mk-svg block w-full max-w-[230px]"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function ConceptCard({
  concept,
  brief,
  selected,
  favorite,
  onSelect,
  onFavorite,
}: {
  concept: Concept;
  brief: Brief;
  selected: boolean;
  favorite: boolean;
  onSelect: () => void;
  onFavorite: () => void;
}) {
  return (
    <div
      className={`relative rounded-xl border overflow-hidden transition-all ${
        selected
          ? "border-[color:var(--color-blue)] shadow-[0_0_0_1px_rgba(59,130,246,.5),0_18px_40px_-24px_rgba(59,130,246,.9)]"
          : "border-[color:var(--color-border)] hover:border-white/25"
      }`}
      style={{ background: concept.onLight ? "#F4F7FA" : "var(--color-surface)" }}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`Select concept ${concept.family}`}
        className="w-full aspect-[4/3] grid place-items-center p-7"
      >
        <LogoBlock concept={concept} brief={brief} palette={concept.palette} ns={concept.id} onLight={concept.onLight} />
      </button>

      <span
        className={`absolute top-2.5 left-2.5 w-5 h-5 rounded grid place-items-center text-[11px] pointer-events-none ${
          selected ? "bg-[color:var(--color-blue)] text-white" : "border border-white/30 bg-black/20"
        }`}
      >
        {selected ? "✓" : ""}
      </span>

      <button
        type="button"
        onClick={onFavorite}
        aria-pressed={favorite}
        aria-label={favorite ? "Remove from favourites" : "Add to favourites"}
        className="absolute top-2 right-2 w-7 h-7 grid place-items-center rounded-md hover:bg-white/10 transition-colors"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill={favorite ? "#3B82F6" : "none"} stroke={favorite ? "#3B82F6" : "currentColor"} strokeWidth="1.8" aria-hidden="true" className={concept.onLight ? "text-slate-500" : "text-white/60"}>
          <path d="M12 20.5 4.3 13a5 5 0 0 1 7-7l.7.7.7-.7a5 5 0 1 1 7 7z" />
        </svg>
      </button>
    </div>
  );
}

function BrandKitCta({ busy, onDownload }: { busy: boolean; onDownload: () => void }) {
  return (
    <div className="mt-6 rounded-xl border border-[rgba(59,130,246,0.32)] bg-[rgba(59,130,246,0.07)] p-6 sm:flex items-center justify-between gap-6">
      <div>
        <h3 className="text-[17px] font-bold mb-1.5">Your brand kit is ready.</h3>
        <ul className="text-[12.5px] text-[color:var(--color-text-secondary)] space-y-1">
          {[
            "Vector SVG — primary, horizontal, icon and light versions",
            "PNG at 2048, 1024 and 512 px",
            "App icons and favicon",
            "Colour palette and a printable brand guide",
          ].map((x) => (
            <li key={x} className="flex items-start gap-2">
              <IconBadgeCheck size={14} className="text-[color:var(--color-blue)] mt-0.5 shrink-0" />
              {x}
            </li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        onClick={onDownload}
        disabled={busy}
        className="btn-primary mt-5 sm:mt-0 shrink-0 uppercase tracking-[0.09em] text-[12px] disabled:opacity-60"
        data-magnetic
      >
        {busy ? "Building…" : "Download brand kit"}
      </button>
    </div>
  );
}

function Panel({
  title,
  sub,
  action,
  children,
}: {
  title: string;
  sub?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="tt-glass p-6 sm:p-7">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-[19px] sm:text-[21px] font-bold tracking-tight">{title}</h2>
          {sub && <p className="text-[13px] text-[color:var(--color-text-secondary)] mt-1.5">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="block text-[11px] font-semibold tracking-[0.14em] uppercase text-[color:var(--color-text-muted)] mb-2">
        {label}
        {required && <span className="text-[color:var(--color-blue)]"> *</span>}
        {hint && <span className="normal-case tracking-normal font-normal"> — {hint}</span>}
      </span>
      {children}
    </label>
  );
}

function Choice({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`text-left rounded-lg border px-3.5 py-2.5 text-[13px] transition-colors ${
        on
          ? "border-[color:var(--color-blue)] bg-[rgba(59,130,246,0.1)]"
          : "border-[color:var(--color-border)] hover:border-white/25"
      }`}
    >
      {children}
    </button>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-2.5">
      <div className="text-[10px] text-[color:var(--color-text-muted)]">{label}</div>
      <div className="text-[12.5px] truncate">{value}</div>
    </div>
  );
}
