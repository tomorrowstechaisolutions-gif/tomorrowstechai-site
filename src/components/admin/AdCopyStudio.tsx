"use client";

import { useState } from "react";
import { AD_FORMATS, CTA_LABELS, gradeField } from "@/lib/campaign/ads";
import { CAMPAIGN_NAME } from "@/lib/campaign/config";

type Variant = {
  name: string;
  angle: string;
  primary_text: string;
  headline: string;
  description: string;
  cta_label: string;
  image_direction: string;
};

/**
 * Brief in, ad copy out. Each variant is shown with its character grading so
 * you can see before saving whether the headline will get clipped.
 *
 * Nothing is written to the database until you pick one — generating is
 * free to throw away.
 */
export function AdCopyStudio({ action }: { action: (formData: FormData) => void }) {
  const [brief, setBrief] = useState("");
  const [audience, setAudience] = useState("");
  const [campaign, setCampaign] = useState(CAMPAIGN_NAME);
  const [state, setState] = useState<"idle" | "working">("idle");
  const [error, setError] = useState("");
  const [variants, setVariants] = useState<Variant[]>([]);
  const [chosen, setChosen] = useState<number | null>(null);

  async function generate() {
    if (!brief.trim()) {
      setError("Say what the ad should be about first.");
      return;
    }
    setState("working");
    setError("");
    setVariants([]);
    setChosen(null);

    try {
      const res = await fetch("/api/admin/ad-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief, audience, campaign, count: 3 }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Generation failed.");
      setVariants(body.variants ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setState("idle");
    }
  }

  const picked = chosen !== null ? variants[chosen] : null;

  return (
    <>
      <section className="ad-panel">
        <div className="ad-panel-head">
          <h2>Brief</h2>
        </div>
        <div className="ad-grid-form">
          <label className="ad-field" style={{ gridColumn: "1 / -1" }}>
            <span className="ad-label">What should this ad say, or who is it for?</span>
            <textarea
              rows={3}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="e.g. Aimed at roofers who are losing work because they have no website. Lead on how fast it goes live."
              className="ad-input"
            />
          </label>
          <label className="ad-field">
            <span className="ad-label">Audience (optional)</span>
            <input
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="Roofers, Central Texas, 1–10 crew"
              className="ad-input"
            />
          </label>
          <label className="ad-field">
            <span className="ad-label">Campaign</span>
            <input
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
              className="ad-input"
            />
          </label>
          <div className="ad-field end">
            <button
              type="button"
              onClick={generate}
              className="ad-btn primary"
              disabled={state === "working"}
            >
              {state === "working" ? "Writing…" : "Write me 3 versions"}
            </button>
          </div>
        </div>
        {error && (
          <p role="alert" className="ad-error" style={{ marginTop: 12 }}>
            {error}
          </p>
        )}
        <p className="ad-note">
          The price, the ${"29"}/month disclosure and the &ldquo;what&rsquo;s not
          included&rdquo; list come from the offer settings, so the copy can&rsquo;t quote a
          price you don&rsquo;t charge or promise something the package doesn&rsquo;t include.
        </p>
      </section>

      {variants.length > 0 && (
        <section className="ad-panel">
          <div className="ad-panel-head">
            <h2>Pick one</h2>
            <span className="ad-muted">Nothing is saved until you do</span>
          </div>
          <div className="ad-variants">
            {variants.map((v, i) => {
              const head = gradeField("headline", v.headline ?? "");
              const primary = gradeField("primary_text", v.primary_text ?? "");
              return (
                <button
                  type="button"
                  key={`${v.name}-${i}`}
                  onClick={() => setChosen(i)}
                  className={`ad-variant ${chosen === i ? "is-on" : ""}`}
                >
                  <span className="ad-variant-angle">{v.angle}</span>
                  <strong className="ad-variant-headline">{v.headline}</strong>
                  <span className="ad-variant-body">{v.primary_text}</span>
                  <span className="ad-variant-meta">
                    <span className={`ad-count t-${head.tone}`}>headline {head.count}</span>
                    <span className={`ad-count t-${primary.tone}`}>
                      body {primary.count}
                    </span>
                    <span className="ad-tag">{v.cta_label}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {picked && (
        <section className="ad-panel">
          <div className="ad-panel-head">
            <h2>Save it</h2>
          </div>
          <form action={action} className="ad-grid-form">
            <input type="hidden" name="generated_by" value="ai" />
            <input type="hidden" name="brief" value={brief} />
            <input type="hidden" name="primary_text" value={picked.primary_text} />
            <input type="hidden" name="headline" value={picked.headline} />
            <input type="hidden" name="description" value={picked.description} />
            <input type="hidden" name="cta_label" value={picked.cta_label} />
            <input type="hidden" name="audience_note" value={audience} />
            <input type="hidden" name="campaign" value={campaign} />
            <input
              type="hidden"
              name="image_note"
              value={picked.image_direction ?? ""}
            />

            <label className="ad-field">
              <span className="ad-label">Ad name</span>
              <input
                name="name"
                defaultValue={picked.name}
                required
                className="ad-input"
              />
            </label>
            <label className="ad-field">
              <span className="ad-label">Ad set</span>
              <input name="adset" className="ad-input" />
            </label>
            <label className="ad-field">
              <span className="ad-label">Format</span>
              <select name="format" defaultValue="feed_4x5" className="ad-input">
                {AD_FORMATS.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="ad-field">
              <span className="ad-label">Button</span>
              <select
                name="cta_label"
                defaultValue={
                  CTA_LABELS.includes(picked.cta_label as (typeof CTA_LABELS)[number])
                    ? picked.cta_label
                    : "Learn More"
                }
                className="ad-input"
              >
                {CTA_LABELS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <div className="ad-field end">
              <button type="submit" className="ad-btn primary">
                Save as draft
              </button>
            </div>
          </form>
          {picked.image_direction && (
            <p className="ad-note">
              <strong>Image this copy needs:</strong> {picked.image_direction}
            </p>
          )}
        </section>
      )}
    </>
  );
}
