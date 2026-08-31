"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { IconSend, IconSpark } from "./Icons";

/**
 * The AI Content Assistant.
 *
 * Writes drafts, and only drafts. Everything it produces lands in
 * content_items with status 'draft' and appears in the review queue below —
 * there is no path from this box to a published post, by design.
 *
 * The formats are picked before generating rather than after, because a
 * LinkedIn post and a Reel script are different pieces of writing, not one
 * text reformatted. The route is told which ones, and writes one row each.
 */

const SUGGESTED = [
  "Create 5 Facebook posts about the $399 Business Launch package",
  "Write LinkedIn content about AI automation for contractors",
  "Promote website services to roofing companies",
  "Turn our services page into a Reel script",
  "Write an email campaign for pool service businesses",
  "Promote Logo Studio",
];

const FORMATS = [
  { key: "facebook_post", label: "Facebook" },
  { key: "instagram_caption", label: "Instagram" },
  { key: "linkedin_post", label: "LinkedIn" },
  { key: "reel_script", label: "Reel / TikTok" },
  { key: "google_business", label: "Google Business" },
  { key: "email", label: "Email" },
  { key: "blog", label: "Blog" },
];

export default function ContentAssistant({
  brands,
  activeBrandId,
}: {
  brands: { id: string; name: string }[];
  activeBrandId: string | null;
}) {
  const router = useRouter();
  const [brief, setBrief] = useState("");
  const [brandId, setBrandId] = useState(activeBrandId ?? brands[0]?.id ?? "");
  const [picked, setPicked] = useState<string[]>(["facebook_post", "linkedin_post"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const toggle = (key: string) =>
    setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));

  const generate = async () => {
    if (!brief.trim() || picked.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/content-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief, formats: picked, brandId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "That didn't work.");
        return;
      }
      const n = Array.isArray(json.drafts) ? json.drafts.length : 0;
      setResult(
        `${n} draft${n === 1 ? "" : "s"} written as ${json.brand} and saved below for review.`
      );
      setBrief("");
      startTransition(() => router.refresh());
    } catch {
      setError("Couldn't reach the generator.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cc-assistant">
      {brands.length > 1 ? (
        <div className="cc-brandbar">
          <span className="cc-label">Writing as</span>
          <select
            className="cc-filter-select"
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
            aria-label="Brand voice"
          >
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="cc-ask">
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="Ask AI to create content..."
          rows={3}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate();
          }}
        />
        <button
          type="button"
          className="cc-ask-send"
          onClick={generate}
          disabled={busy || !brief.trim() || picked.length === 0}
          aria-label="Generate drafts"
        >
          <IconSend size={15} />
        </button>
      </div>

      <div className="cc-formats">
        {FORMATS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`cc-format ${picked.includes(f.key) ? "is-on" : ""}`}
            onClick={() => toggle(f.key)}
            aria-pressed={picked.includes(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {busy ? (
        <p className="cc-note">Writing {picked.length} draft{picked.length === 1 ? "" : "s"}…</p>
      ) : null}
      {error ? <div className="cc-error"><span>{error}</span></div> : null}
      {result ? (
        <div className="cc-answer">
          <IconSpark size={14} /> {result}
        </div>
      ) : null}

      <span className="cc-subhead">Suggested</span>
      <div className="cc-prompts">
        {SUGGESTED.map((s) => (
          <button key={s} type="button" className="cc-prompt" onClick={() => setBrief(s)}>
            {s}
          </button>
        ))}
      </div>

      <p className="cc-note">
        Everything generated here is saved as a <strong>draft</strong> and appears in the review
        queue. Nothing is published, scheduled or sent without you approving it first.
      </p>
    </div>
  );
}
