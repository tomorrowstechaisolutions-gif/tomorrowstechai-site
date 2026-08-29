"use client";

import { useMemo, useState } from "react";
import {
  AD_FORMATS,
  AD_STATUSES,
  CTA_LABELS,
  buildDestinationUrl,
  gradeField,
  type AdField,
} from "@/lib/campaign/ads";
import { CopyButton } from "./CopyButton";
import type { AdCreative } from "@/lib/supabase/types";

type Props = {
  ad: AdCreative;
  action: (formData: FormData) => void;
};

/**
 * The edit screen. Counters are live and graded against where each field
 * visually truncates on a phone, not Meta's hard limit — the hard limit is
 * miles away and almost never the thing that bites.
 */
export function AdEditor({ ad, action }: Props) {
  const [name, setName] = useState(ad.name);
  const [campaign, setCampaign] = useState(ad.campaign);
  const [path, setPath] = useState(ad.destination_path);
  const [primaryText, setPrimaryText] = useState(ad.primary_text);
  const [headline, setHeadline] = useState(ad.headline);
  const [description, setDescription] = useState(ad.description);

  const trackingUrl = useMemo(
    () => buildDestinationUrl({ path, campaign }),
    [path, campaign]
  );

  const previewUrl = useMemo(
    () =>
      buildDestinationUrl({
        path,
        campaign,
        resolved: { adset: ad.adset || "adset", ad: name || "ad", placement: "instagram_feed" },
      }),
    [path, campaign, name, ad.adset]
  );

  return (
    <form action={action} className="ad-studio">
      <input type="hidden" name="id" value={ad.id} />
      <input type="hidden" name="generated_by" value={ad.generated_by} />

      <div className="ad-two">
        <div className="ad-col-main">
          <section className="ad-panel">
            <div className="ad-panel-head">
              <h2>Ad copy</h2>
              <span className="ad-muted">Paste these into Ads Manager field for field</span>
            </div>

            <Counted
              field="primary_text"
              label="Primary text"
              name="primary_text"
              value={primaryText}
              onChange={setPrimaryText}
              rows={9}
            />
            <Counted
              field="headline"
              label="Headline"
              name="headline"
              value={headline}
              onChange={setHeadline}
            />
            <Counted
              field="description"
              label="Description"
              name="description"
              value={description}
              onChange={setDescription}
            />

            <div className="ad-field">
              <span className="ad-label">Button</span>
              <select name="cta_label" defaultValue={ad.cta_label} className="ad-input">
                {CTA_LABELS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </section>

          <section className="ad-panel">
            <div className="ad-panel-head">
              <h2>Destination</h2>
            </div>
            <label className="ad-field">
              <span className="ad-label">Landing path</span>
              <input
                name="destination_path"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                className="ad-input"
              />
            </label>

            <div className="ad-url">
              <div className="ad-url-head">
                <span className="ad-label">Paste this as the ad&rsquo;s website URL</span>
                <CopyButton value={trackingUrl} label="Copy URL" />
              </div>
              <code className="ad-url-value">{trackingUrl}</code>
              <p className="ad-note">
                The <code>{"{{ }}"}</code> parts are Meta&rsquo;s placeholders — Meta fills in the
                real ad set, ad and placement when the ad runs. That is what lets the
                campaign dashboard report cost per lead <em>per ad</em>.
              </p>
              <p className="ad-note">
                A lead from this ad will arrive looking like:{" "}
                <code className="ad-break">{previewUrl}</code>
              </p>
              <p className="ad-note">
                <strong>The ad&rsquo;s name in Ads Manager must match &ldquo;{name}&rdquo; exactly</strong>,
                or spend and leads won&rsquo;t line up against each other.
              </p>
            </div>
          </section>

          <section className="ad-panel">
            <div className="ad-panel-head">
              <h2>Image</h2>
            </div>
            <label className="ad-field">
              <span className="ad-label">Link to the artwork (Canva, Drive, anywhere)</span>
              <input
                name="image_url"
                defaultValue={ad.image_url ?? ""}
                placeholder="https://canva.com/design/..."
                className="ad-input"
              />
            </label>
            <label className="ad-field">
              <span className="ad-label">What the image shows</span>
              <textarea
                name="image_note"
                rows={3}
                defaultValue={ad.image_note ?? ""}
                className="ad-input"
              />
            </label>
          </section>
        </div>

        <div className="ad-col-side">
          <section className="ad-panel">
            <div className="ad-panel-head">
              <h2>Setup</h2>
            </div>
            <label className="ad-field">
              <span className="ad-label">Ad name</span>
              <input
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="ad-input"
              />
            </label>
            <label className="ad-field">
              <span className="ad-label">Campaign</span>
              <input
                name="campaign"
                value={campaign}
                onChange={(e) => setCampaign(e.target.value)}
                className="ad-input"
              />
            </label>
            <label className="ad-field">
              <span className="ad-label">Ad set</span>
              <input name="adset" defaultValue={ad.adset} className="ad-input" />
            </label>
            <label className="ad-field">
              <span className="ad-label">Status</span>
              <select name="status" defaultValue={ad.status} className="ad-input">
                {AD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="ad-field">
              <span className="ad-label">Format</span>
              <select name="format" defaultValue={ad.format} className="ad-input">
                {AD_FORMATS.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="ad-btn primary">
              Save
            </button>
          </section>

          <section className="ad-panel">
            <div className="ad-panel-head">
              <h2>Targeting &amp; notes</h2>
            </div>
            <label className="ad-field">
              <span className="ad-label">Audience</span>
              <textarea
                name="audience_note"
                rows={4}
                defaultValue={ad.audience_note ?? ""}
                placeholder="Who this is pointed at, and why"
                className="ad-input"
              />
            </label>
            <label className="ad-field">
              <span className="ad-label">Notes</span>
              <textarea
                name="notes"
                rows={5}
                defaultValue={ad.notes ?? ""}
                placeholder="What you learned running it"
                className="ad-input"
              />
            </label>
          </section>
        </div>
      </div>
    </form>
  );
}

function Counted({
  field,
  label,
  name,
  value,
  onChange,
  rows,
}: {
  field: AdField;
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  const state = gradeField(field, value);

  return (
    <div className="ad-field">
      <div className="ad-count-head">
        <span className="ad-label">{label}</span>
        <span className={`ad-count t-${state.tone}`}>{state.count}</span>
        <CopyButton value={value} />
      </div>
      {rows ? (
        <textarea
          name={name}
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="ad-input"
        />
      ) : (
        <input
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="ad-input"
        />
      )}
      <span className={`ad-count-hint t-${state.tone}`}>{state.hint}</span>
    </div>
  );
}
