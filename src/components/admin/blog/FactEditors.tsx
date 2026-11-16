"use client";

import type { ArticleSource, Discrepancy, SourceKind, TechSpec } from "@/lib/blog/types";

/**
 * Editors for an article's sources, technical specs and source disagreements.
 * Plain controlled lists: each row edits one object of the article record.
 */

const KINDS: { value: SourceKind; label: string }[] = [
  { value: "primary", label: "Primary (the original)" },
  { value: "secondary", label: "Secondary (reporting on it)" },
  { value: "vendor", label: "Vendor / company" },
  { value: "dataset", label: "Dataset" },
  { value: "other", label: "Other" },
];

function replaceAt<T>(list: T[], i: number, next: T): T[] {
  return list.map((x, j) => (j === i ? next : x));
}

function move<T>(list: T[], i: number, by: -1 | 1): T[] {
  const j = i + by;
  if (j < 0 || j >= list.length) return list;
  const copy = [...list];
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}

function RowTools({ index, count, onMove, onRemove, label }: { index: number; count: number; onMove: (by: -1 | 1) => void; onRemove: () => void; label: string }) {
  return (
    <div className="be-rowtools">
      <button type="button" className="cc-btn is-sm" onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Move ${label} up`}>↑</button>
      <button type="button" className="cc-btn is-sm" onClick={() => onMove(1)} disabled={index === count - 1} aria-label={`Move ${label} down`}>↓</button>
      <button type="button" className="cc-btn is-sm is-danger" onClick={onRemove} aria-label={`Remove ${label}`}>Remove</button>
    </div>
  );
}

const sourceIdFrom = (s: Pick<ArticleSource, "publisher" | "title">) =>
  (s.publisher || s.title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "source";

export function SourcesEditor({
  sources,
  onChange,
  onCite,
  today,
}: {
  sources: ArticleSource[];
  onChange: (next: ArticleSource[]) => void;
  onCite: (id: string) => void;
  today: string;
}) {
  const add = () => onChange([...sources, { id: "", title: "", publisher: "", kind: "primary", accessedAt: today }]);
  return (
    <div className="be-list">
      <p className="be-help">
        Every fact from elsewhere cites a source. Cite one in the body with <code>[^id]</code>; it shows as a numbered link to this list.
        Sources show to readers in this order.
      </p>
      {sources.map((s, i) => {
        const set = (patch: Partial<ArticleSource>) => onChange(replaceAt(sources, i, { ...s, ...patch }));
        return (
          <fieldset key={i} className="be-card">
            <legend className="be-card-title">
              <span className="be-num">{i + 1}</span> {s.title || "New source"}
            </legend>
            <div className="be-cols">
              <label className="cc-field">
                <span className="cc-label">Title</span>
                <input className="cc-input" value={s.title} onChange={(e) => set({ title: e.target.value })} placeholder="Headline or document title" />
              </label>
              <label className="cc-field">
                <span className="cc-label">Publisher</span>
                <input
                  className="cc-input"
                  value={s.publisher}
                  onChange={(e) => set({ publisher: e.target.value })}
                  onBlur={() => !s.id && (s.publisher || s.title) && set({ id: sourceIdFrom(s) })}
                  placeholder="e.g. Reuters, Smartsheet"
                />
              </label>
            </div>
            <label className="cc-field">
              <span className="cc-label">URL</span>
              <input className="cc-input" value={s.url ?? ""} onChange={(e) => set({ url: e.target.value })} placeholder="https://…" inputMode="url" />
            </label>
            <div className="be-cols three">
              <label className="cc-field">
                <span className="cc-label">Citation id</span>
                <input className="cc-input be-mono" value={s.id} onChange={(e) => set({ id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} placeholder="reuters" />
              </label>
              <label className="cc-field">
                <span className="cc-label">Kind</span>
                <select className="cc-select" value={s.kind} onChange={(e) => set({ kind: e.target.value as SourceKind })}>
                  {KINDS.map((k) => (
                    <option key={k.value} value={k.value}>{k.label}</option>
                  ))}
                </select>
              </label>
              <label className="cc-field">
                <span className="cc-label">Author (optional)</span>
                <input className="cc-input" value={s.author ?? ""} onChange={(e) => set({ author: e.target.value })} />
              </label>
            </div>
            <div className="be-cols">
              <label className="cc-field">
                <span className="cc-label">Source published</span>
                <input type="date" className="cc-input" value={s.publishedAt ?? ""} onChange={(e) => set({ publishedAt: e.target.value })} />
              </label>
              <label className="cc-field">
                <span className="cc-label">Checked by us on</span>
                <input type="date" className="cc-input" value={s.accessedAt ?? ""} onChange={(e) => set({ accessedAt: e.target.value })} />
              </label>
            </div>
            <label className="cc-field">
              <span className="cc-label">Note (optional, shown to readers)</span>
              <input className="cc-input" value={s.note ?? ""} onChange={(e) => set({ note: e.target.value })} />
            </label>
            <div className="be-rowfoot">
              <button type="button" className="cc-btn is-sm" onClick={() => s.id && onCite(s.id)} disabled={!s.id}>
                Insert [^{s.id || "id"}] at cursor
              </button>
              <RowTools index={i} count={sources.length} label="source" onMove={(by) => onChange(move(sources, i, by))} onRemove={() => onChange(sources.filter((_, j) => j !== i))} />
            </div>
          </fieldset>
        );
      })}
      <button type="button" className="cc-btn" onClick={add}>+ Add source</button>
    </div>
  );
}

export function SpecsEditor({ specs, sourceIds, onChange }: { specs: TechSpec[]; sourceIds: string[]; onChange: (next: TechSpec[]) => void }) {
  return (
    <div className="be-list">
      <p className="be-help">
        Technical figures the article states (prices, VRAM, release dates). Each needs at least one source. Tick verified only after
        checking it against every source listed; unverified figures are shown as reported.
      </p>
      {specs.map((s, i) => {
        const set = (patch: Partial<TechSpec>) => onChange(replaceAt(specs, i, { ...s, ...patch }));
        return (
          <fieldset key={i} className="be-card">
            <legend className="be-card-title">{s.label || "New spec"}</legend>
            <div className="be-cols">
              <label className="cc-field">
                <span className="cc-label">Label</span>
                <input className="cc-input" value={s.label} onChange={(e) => set({ label: e.target.value })} placeholder="e.g. GPU memory" />
              </label>
              <label className="cc-field">
                <span className="cc-label">Value</span>
                <input className="cc-input" value={s.value} onChange={(e) => set({ value: e.target.value })} placeholder="e.g. 32 GB HBM2" />
              </label>
            </div>
            <div className="cc-field">
              <span className="cc-label">Sources</span>
              <div className="be-chips">
                {sourceIds.length === 0 ? <span className="cc-faint">Add sources first.</span> : null}
                {sourceIds.map((id) => {
                  const on = s.sourceIds.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`cc-btn is-sm${on ? " is-on" : ""}`}
                      aria-pressed={on}
                      onClick={() => set({ sourceIds: on ? s.sourceIds.filter((x) => x !== id) : [...s.sourceIds, id] })}
                    >
                      {id}
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="cc-field">
              <span className="cc-label">Note (optional)</span>
              <input className="cc-input" value={s.note ?? ""} onChange={(e) => set({ note: e.target.value })} />
            </label>
            <div className="be-rowfoot">
              <label className="be-check">
                <input type="checkbox" checked={s.verified} onChange={(e) => set({ verified: e.target.checked })} /> Verified against every source
              </label>
              <RowTools index={i} count={specs.length} label="spec" onMove={(by) => onChange(move(specs, i, by))} onRemove={() => onChange(specs.filter((_, j) => j !== i))} />
            </div>
          </fieldset>
        );
      })}
      <button type="button" className="cc-btn" onClick={() => onChange([...specs, { label: "", value: "", sourceIds: [], verified: false }])}>
        + Add spec
      </button>
    </div>
  );
}

export function DiscrepanciesEditor({
  items,
  sourceIds,
  onChange,
}: {
  items: Discrepancy[];
  sourceIds: string[];
  onChange: (next: Discrepancy[]) => void;
}) {
  return (
    <div className="be-list">
      <p className="be-help">When sources disagree, show readers both accounts instead of silently picking one. Leave the resolution blank if it is unresolved.</p>
      {items.map((d, i) => {
        const set = (patch: Partial<Discrepancy>) => onChange(replaceAt(items, i, { ...d, ...patch }));
        return (
          <fieldset key={i} className="be-card">
            <legend className="be-card-title">{d.topic || "New disagreement"}</legend>
            <label className="cc-field">
              <span className="cc-label">Topic</span>
              <input className="cc-input" value={d.topic} onChange={(e) => set({ topic: e.target.value })} placeholder="e.g. Launch date" />
            </label>
            {d.accounts.map((a, k) => (
              <div key={k} className="be-account">
                <select
                  className="cc-select"
                  value={a.sourceId}
                  onChange={(e) => set({ accounts: replaceAt(d.accounts, k, { ...a, sourceId: e.target.value }) })}
                  aria-label="Source"
                >
                  <option value="">Source…</option>
                  {sourceIds.map((id) => (
                    <option key={id} value={id}>{id}</option>
                  ))}
                </select>
                <input
                  className="cc-input"
                  value={a.claim}
                  onChange={(e) => set({ accounts: replaceAt(d.accounts, k, { ...a, claim: e.target.value }) })}
                  placeholder="What this source says"
                  aria-label="Claim"
                />
                <button type="button" className="cc-btn is-sm is-danger" onClick={() => set({ accounts: d.accounts.filter((_, j) => j !== k) })} aria-label="Remove account">
                  ×
                </button>
              </div>
            ))}
            <button type="button" className="cc-btn is-sm" onClick={() => set({ accounts: [...d.accounts, { sourceId: "", claim: "" }] })}>
              + Add account
            </button>
            <label className="cc-field" style={{ marginTop: 10 }}>
              <span className="cc-label">Resolution (optional)</span>
              <textarea className="cc-textarea" rows={2} value={d.resolution ?? ""} onChange={(e) => set({ resolution: e.target.value })} placeholder="What we concluded and why" />
            </label>
            <div className="be-rowfoot">
              <span />
              <RowTools index={i} count={items.length} label="disagreement" onMove={(by) => onChange(move(items, i, by))} onRemove={() => onChange(items.filter((_, j) => j !== i))} />
            </div>
          </fieldset>
        );
      })}
      <button
        type="button"
        className="cc-btn"
        onClick={() => onChange([...items, { topic: "", accounts: [{ sourceId: "", claim: "" }, { sourceId: "", claim: "" }] }])}
      >
        + Add disagreement
      </button>
    </div>
  );
}
