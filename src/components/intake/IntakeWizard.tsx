"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  ATTESTATION_RIGHTS,
  ATTESTATION_TURNAROUND,
  DOMAIN_STATUSES,
  FILE_KINDS,
  FIELD_LABELS,
  INTAKE_STEPS,
  MAX_FILE_BYTES,
  PRIMARY_CTAS,
  SOCIAL_NETWORKS,
  STARTER_PROMISED_DAYS,
  TOTAL_STEPS,
  missingRequirements,
  type FileKind,
  type IntakeFile,
  type IntakeRecord,
} from "@/lib/intake/config";
import { IntakeComplete } from "./IntakeComplete";

type Missing = { field: string; label: string; step: number };

/** Every text answer, held as strings so inputs stay controlled. */
type Draft = Record<string, string>;

const TEXT_FIELDS = [
  "business_name", "contact_name", "email", "phone", "business_address",
  "service_area", "business_hours", "google_business_url",
  "business_description", "services_offered", "home_page_content",
  "services_page_content", "contact_page_info", "primary_cta", "testimonials",
  "brand_colors", "example_websites", "legal_text",
  "domain_status", "domain_name", "registrar", "domain_notes",
] as const;

function toDraft(intake: IntakeRecord): Draft {
  const d: Draft = {};
  for (const f of TEXT_FIELDS) {
    const v = intake[f as keyof IntakeRecord];
    d[f] = typeof v === "string" ? v : "";
  }
  return d;
}

export function IntakeWizard({
  token,
  initialIntake,
  initialFiles,
}: {
  token: string;
  initialIntake: IntakeRecord;
  initialFiles: IntakeFile[];
}) {
  const [intake, setIntake] = useState(initialIntake);
  const [files, setFiles] = useState(initialFiles);
  const [draft, setDraft] = useState<Draft>(() => toDraft(initialIntake));
  const [social, setSocial] = useState<Record<string, string>>(
    () => initialIntake.social_links ?? {}
  );
  const [attestTurnaround, setAttestTurnaround] = useState(initialIntake.attest_turnaround);
  const [attestRights, setAttestRights] = useState(initialIntake.attest_rights);

  const [step, setStep] = useState(Math.min(initialIntake.current_step, TOTAL_STEPS));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<Missing[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  const set = useCallback((field: string, value: string) => {
    setDraft((d) => ({ ...d, [field]: value }));
  }, []);

  const stillMissing = useMemo(
    () =>
      missingRequirements(
        {
          ...(draft as unknown as Record<string, string | null>),
          attest_turnaround: attestTurnaround,
          attest_rights: attestRights,
        } as Parameters<typeof missingRequirements>[0],
        files
      ),
    [draft, attestTurnaround, attestRights, files]
  );

  const scrollTop = () => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  /** Saves the whole draft, not just this step — cheap, and it means a client
   *  who edits step 1 from step 4 never loses the edit. */
  async function persist(nextStep: number): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/intake/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          step: nextStep,
          fields: {
            ...draft,
            social_links: social,
            attest_turnaround: attestTurnaround,
            attest_rights: attestRights,
          },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Could not save. Check your connection and try again.");
        return false;
      }
      if (json.intake) setIntake(json.intake as IntakeRecord);
      return true;
    } catch {
      setError("Could not save. Check your connection and try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function goNext() {
    const next = Math.min(step + 1, TOTAL_STEPS);
    if (await persist(next)) {
      setStep(next);
      scrollTop();
    }
  }

  async function goBack() {
    const prev = Math.max(step - 1, 1);
    await persist(step);
    setStep(prev);
    scrollTop();
  }

  async function jumpTo(n: number) {
    await persist(step);
    setStep(n);
    scrollTop();
  }

  async function upload(kind: FileKind, file: File) {
    if (file.size > MAX_FILE_BYTES) {
      setError(`${file.name} is larger than 25MB.`);
      return;
    }
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("token", token);
    form.set("kind", kind);
    form.set("file", file);
    try {
      const res = await fetch("/api/intake/upload", { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "That upload did not go through.");
        return;
      }
      setFiles((f) => [...f, json.file as IntakeFile]);
    } catch {
      setError("That upload did not go through.");
    } finally {
      setBusy(false);
    }
  }

  async function dropFile(id: string) {
    setBusy(true);
    try {
      await fetch("/api/intake/upload", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, fileId: id }),
      });
      setFiles((f) => f.filter((x) => x.id !== id));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!(await persist(TOTAL_STEPS))) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/intake/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 422 && Array.isArray(json.missing)) {
        setMissing(json.missing as Missing[]);
        setError("A few required answers are still empty.");
        return;
      }
      if (!res.ok) {
        setError(json.error ?? "Could not submit.");
        return;
      }
      if (json.intake) setIntake(json.intake as IntakeRecord);
      setSubmitted(true);
    } catch {
      setError("Could not submit. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <IntakeComplete
        intake={{ ...intake, status: "submitted", submitted_at: intake.submitted_at ?? new Date().toISOString() }}
        fileCount={files.length}
      />
    );
  }

  const current = INTAKE_STEPS[step - 1];

  return (
    <main className="itk-page">
      <div className="itk-shell" ref={topRef}>
        <div className="itk-brandline">Tomorrow&rsquo;s Tech AI</div>
        <h1 className="itk-h1">Starter Website intake</h1>
        <p className="itk-lead">
          Five short steps. Everything saves as you go, so you can stop and come
          back on the same link.
        </p>

        <ol className="itk-progress" aria-label="Progress">
          {INTAKE_STEPS.map((s) => (
            <li key={s.n}>
              <button
                type="button"
                onClick={() => jumpTo(s.n)}
                disabled={busy}
                data-state={s.n === step ? "current" : s.n < step ? "done" : "todo"}
              >
                <span className="itk-progress-n">{s.n < step ? "✓" : s.n}</span>
                <span className="itk-progress-label">{s.title}</span>
              </button>
            </li>
          ))}
        </ol>

        <section className="itk-card">
          <header className="itk-card-head">
            <div className="itk-step-of">
              Step {step} of {TOTAL_STEPS}
            </div>
            <h2 className="itk-h2">{current.title}</h2>
            <p className="itk-blurb">{current.blurb}</p>
          </header>

          {error ? (
            <div className="itk-alert" role="alert">
              {error}
            </div>
          ) : null}

          {missing.length > 0 ? (
            <div className="itk-missing" role="alert">
              <strong>Still needed before we can start:</strong>
              <ul>
                {missing.map((m) => (
                  <li key={m.field}>
                    <button type="button" onClick={() => jumpTo(m.step)} disabled={busy}>
                      {m.label} &mdash; step {m.step}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {step === 1 ? <StepBusiness draft={draft} set={set} /> : null}
          {step === 2 ? <StepContent draft={draft} set={set} /> : null}
          {step === 3 ? (
            <StepBranding
              draft={draft}
              set={set}
              social={social}
              setSocial={setSocial}
              files={files}
              onUpload={upload}
              onRemove={dropFile}
              busy={busy}
            />
          ) : null}
          {step === 4 ? <StepDomain draft={draft} set={set} /> : null}
          {step === 5 ? (
            <StepReview
              draft={draft}
              files={files}
              missing={stillMissing}
              attestTurnaround={attestTurnaround}
              attestRights={attestRights}
              setAttestTurnaround={setAttestTurnaround}
              setAttestRights={setAttestRights}
              onJump={jumpTo}
              busy={busy}
            />
          ) : null}

          <footer className="itk-actions">
            {step > 1 ? (
              <button type="button" className="itk-btn" onClick={goBack} disabled={busy}>
                &larr; Back
              </button>
            ) : (
              <span />
            )}

            {step < TOTAL_STEPS ? (
              <button type="button" className="itk-btn itk-btn--primary" onClick={goNext} disabled={busy}>
                {busy ? "Saving…" : "Save and continue →"}
              </button>
            ) : (
              <button
                type="button"
                className="itk-btn itk-btn--primary"
                onClick={submit}
                disabled={busy || stillMissing.length > 0}
              >
                {busy ? "Submitting…" : "Submit my intake"}
              </button>
            )}
          </footer>
        </section>

        <p className="itk-fineprint">
          Questions? Reply to the email this link came from, or call
          (254) 563-2130. Your {STARTER_PROMISED_DAYS}-business-day build window
          starts once we have checked everything here.
        </p>
      </div>
    </main>
  );
}

// ─── Fields ────────────────────────────────────────────────────────────────

type FieldProps = { draft: Draft; set: (f: string, v: string) => void };

function Text({
  draft, set, name, hint, required, placeholder, type = "text",
}: FieldProps & {
  name: string; hint?: string; required?: boolean; placeholder?: string; type?: string;
}) {
  return (
    <label className="itk-field">
      <span className="itk-label">
        {FIELD_LABELS[name] ?? name}
        {required ? <em aria-hidden="true"> *</em> : null}
      </span>
      {hint ? <span className="itk-hint">{hint}</span> : null}
      <input
        type={type}
        value={draft[name] ?? ""}
        placeholder={placeholder}
        onChange={(e) => set(name, e.target.value)}
      />
    </label>
  );
}

function Area({
  draft, set, name, hint, required, rows = 5, placeholder,
}: FieldProps & {
  name: string; hint?: string; required?: boolean; rows?: number; placeholder?: string;
}) {
  return (
    <label className="itk-field">
      <span className="itk-label">
        {FIELD_LABELS[name] ?? name}
        {required ? <em aria-hidden="true"> *</em> : null}
      </span>
      {hint ? <span className="itk-hint">{hint}</span> : null}
      <textarea
        rows={rows}
        value={draft[name] ?? ""}
        placeholder={placeholder}
        onChange={(e) => set(name, e.target.value)}
      />
    </label>
  );
}

function StepBusiness({ draft, set }: FieldProps) {
  return (
    <div className="itk-fields">
      <Text draft={draft} set={set} name="business_name" required placeholder="Premier Roofing LLC" />
      <Text draft={draft} set={set} name="contact_name" required placeholder="Who we should talk to" />
      <Text draft={draft} set={set} name="email" type="email" required />
      <Text draft={draft} set={set} name="phone" type="tel" required />
      <Area draft={draft} set={set} name="business_address" required rows={3}
        hint="If you work from home and would rather not publish an address, say so here and we will show the service area instead." />
      <Area draft={draft} set={set} name="service_area" required rows={3}
        hint="The towns and cities you actually cover." placeholder="Temple, Belton, Killeen, Salado — 40 miles of Temple" />
      <Area draft={draft} set={set} name="business_hours" required rows={3}
        placeholder={"Mon–Fri 7:00am–6:00pm\nSat 8:00am–2:00pm\nSun closed"} />
      <Text draft={draft} set={set} name="google_business_url"
        hint="Optional, but it is how your reviews and map pin get onto the site." />
    </div>
  );
}

function StepContent({ draft, set }: FieldProps) {
  return (
    <div className="itk-fields">
      <Area draft={draft} set={set} name="business_description" required rows={5}
        hint="A few sentences on what you do and who you do it for. Write it how you would say it out loud." />
      <Area draft={draft} set={set} name="services_offered" required rows={6}
        hint="One per line. These become the Services page." />
      <Area draft={draft} set={set} name="home_page_content" required rows={8}
        hint="What should the home page say? Rough notes are fine — we will tidy the wording." />
      <Area draft={draft} set={set} name="services_page_content" required rows={8}
        hint="More detail on each service: what is involved, who it suits, anything customers always ask." />
      <Area draft={draft} set={set} name="contact_page_info" required rows={4}
        hint="Anything beyond phone and email — best times to call, whether you do free estimates, areas you will not travel to." />

      <fieldset className="itk-field">
        <legend className="itk-label">
          Primary call to action<em aria-hidden="true"> *</em>
        </legend>
        <span className="itk-hint">The main button on every page. Pick the one you actually want people to do.</span>
        <div className="itk-choices">
          {PRIMARY_CTAS.map((cta) => (
            <label key={cta} className="itk-choice" data-selected={draft.primary_cta === cta}>
              <input
                type="radio"
                name="primary_cta"
                value={cta}
                checked={draft.primary_cta === cta}
                onChange={() => set("primary_cta", cta)}
              />
              <span>{cta}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <Area draft={draft} set={set} name="testimonials" rows={6}
        hint="Optional. Paste real reviews you want shown, with the customer's name or initials. We will not invent any." />
    </div>
  );
}

function StepBranding({
  draft, set, social, setSocial, files, onUpload, onRemove, busy,
}: FieldProps & {
  social: Record<string, string>;
  setSocial: (v: Record<string, string>) => void;
  files: IntakeFile[];
  onUpload: (kind: FileKind, file: File) => void;
  onRemove: (id: string) => void;
  busy: boolean;
}) {
  return (
    <div className="itk-fields">
      {FILE_KINDS.map((kind) => {
        const mine = files.filter((f) => f.kind === kind.value);
        return (
          <div className="itk-field" key={kind.value}>
            <span className="itk-label">
              {kind.label}
              {kind.required ? <em aria-hidden="true"> *</em> : null}
            </span>
            <span className="itk-hint">{kind.hint}</span>

            <label className="itk-upload">
              <input
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif,application/pdf"
                disabled={busy}
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? []);
                  picked.forEach((f) => onUpload(kind.value, f));
                  e.target.value = "";
                }}
              />
              <span>Choose files</span>
            </label>

            {mine.length > 0 ? (
              <ul className="itk-filelist">
                {mine.map((f) => (
                  <li key={f.id}>
                    <span className="itk-filename">{f.file_name}</span>
                    <span className="itk-filesize">
                      {f.size_bytes ? `${Math.round(f.size_bytes / 1024)} KB` : ""}
                    </span>
                    <button type="button" onClick={() => onRemove(f.id)} disabled={busy}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}

      <Text draft={draft} set={set} name="brand_colors"
        hint="Optional. Hex codes if you have them, or just describe them." placeholder="#1E4B8F navy and a warm grey" />
      <Area draft={draft} set={set} name="example_websites" rows={4}
        hint="Optional. Sites you like the look of — one per line. Competitors are useful too." />
      <Area draft={draft} set={set} name="legal_text" rows={4}
        hint="Optional. Licence numbers, insurance wording, disclaimers you are required to display." />

      <fieldset className="itk-field">
        <legend className="itk-label">Social media links</legend>
        <span className="itk-hint">Optional. Leave blank any you do not use.</span>
        <div className="itk-social">
          {SOCIAL_NETWORKS.map((net) => (
            <label key={net.key}>
              <span>{net.label}</span>
              <input
                type="url"
                value={social[net.key] ?? ""}
                placeholder="https://"
                onChange={(e) => setSocial({ ...social, [net.key]: e.target.value })}
              />
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

function StepDomain({ draft, set }: FieldProps) {
  return (
    <div className="itk-fields">
      <fieldset className="itk-field">
        <legend className="itk-label">
          Domain<em aria-hidden="true"> *</em>
        </legend>
        <span className="itk-hint">Where the site will live.</span>
        <div className="itk-choices itk-choices--stack">
          {DOMAIN_STATUSES.map((d) => (
            <label key={d.value} className="itk-choice" data-selected={draft.domain_status === d.value}>
              <input
                type="radio"
                name="domain_status"
                value={d.value}
                checked={draft.domain_status === d.value}
                onChange={() => set("domain_status", d.value)}
              />
              <span>{d.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <Text draft={draft} set={set} name="domain_name"
        hint={
          draft.domain_status === "new"
            ? "The one you would like, if it is available. We will check and tell you."
            : "The domain the site should use."
        }
        placeholder="premierroofingtx.com" />

      <Text draft={draft} set={set} name="registrar"
        hint="Only if you already own it — GoDaddy, Namecheap, Google Domains, whoever you bought it from. Do not send passwords; we will tell you exactly which two records to change." />

      <Area draft={draft} set={set} name="domain_notes" rows={4}
        hint="Anything else about the domain or an existing site — email on that domain we must not break, a site currently live, a previous developer still holding access." />

      <p className="itk-note">
        We never ask for your registrar password. When it is time to go live we
        send you the two DNS records to add, or walk you through it on a call.
      </p>
    </div>
  );
}

function StepReview({
  draft, files, missing, attestTurnaround, attestRights,
  setAttestTurnaround, setAttestRights, onJump, busy,
}: {
  draft: Draft;
  files: IntakeFile[];
  missing: Missing[];
  attestTurnaround: boolean;
  attestRights: boolean;
  setAttestTurnaround: (v: boolean) => void;
  setAttestRights: (v: boolean) => void;
  onJump: (n: number) => void;
  busy: boolean;
}) {
  const gaps = missing.filter((m) => !m.field.startsWith("attest_"));

  return (
    <div className="itk-fields">
      {gaps.length === 0 ? (
        <div className="itk-ready">Everything required is filled in.</div>
      ) : (
        <div className="itk-missing">
          <strong>
            {gaps.length} thing{gaps.length === 1 ? "" : "s"} still needed
          </strong>
          <ul>
            {gaps.map((m) => (
              <li key={m.field}>
                <button type="button" onClick={() => onJump(m.step)} disabled={busy}>
                  {m.label} &mdash; step {m.step}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <dl className="itk-summary">
        <Row label="Business" value={draft.business_name} />
        <Row label="Contact" value={[draft.contact_name, draft.email, draft.phone].filter(Boolean).join(" · ")} />
        <Row label="Service area" value={draft.service_area} />
        <Row label="Primary button" value={draft.primary_cta} />
        <Row
          label="Domain"
          value={[
            DOMAIN_STATUSES.find((d) => d.value === draft.domain_status)?.label,
            draft.domain_name,
          ].filter(Boolean).join(" · ")}
        />
        <Row label="Files uploaded" value={`${files.length}`} />
      </dl>

      <label className="itk-attest" data-checked={attestTurnaround}>
        <input
          type="checkbox"
          checked={attestTurnaround}
          onChange={(e) => setAttestTurnaround(e.target.checked)}
        />
        <span>{ATTESTATION_TURNAROUND}</span>
      </label>

      <label className="itk-attest" data-checked={attestRights}>
        <input
          type="checkbox"
          checked={attestRights}
          onChange={(e) => setAttestRights(e.target.checked)}
        />
        <span>{ATTESTATION_RIGHTS}</span>
      </label>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value && value.length ? value : <span className="itk-blank">Not given</span>}</dd>
    </>
  );
}
