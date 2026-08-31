import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { extendIntakeLink } from "@/app/admin/actions";
import { signedFileUrl, intakeUrl } from "@/lib/intake/service";
import {
  FIELD_LABELS,
  FILE_KINDS,
  SOCIAL_NETWORKS,
  missingRequirements,
  type IntakeFile,
  type IntakeRecord,
} from "@/lib/intake/config";

export const dynamic = "force-dynamic";

const SECTIONS: { title: string; fields: string[] }[] = [
  {
    title: "Business information",
    fields: [
      "business_name", "contact_name", "email", "phone",
      "business_address", "service_area", "business_hours", "google_business_url",
    ],
  },
  {
    title: "Website content",
    fields: [
      "business_description", "services_offered", "home_page_content",
      "services_page_content", "contact_page_info", "primary_cta", "testimonials",
    ],
  },
  { title: "Branding", fields: ["brand_colors", "example_websites", "legal_text"] },
  { title: "Domain", fields: ["domain_status", "domain_name", "registrar", "domain_notes"] },
];

export default async function IntakeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("client_intakes")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();
  const intake = data as IntakeRecord;

  const { data: fileRows } = await supabase
    .from("intake_files")
    .select("*")
    .eq("intake_id", intake.id)
    .order("created_at", { ascending: true });

  const files = (fileRows ?? []) as IntakeFile[];

  // Signed per request, ten minutes each. The bucket is private, so a link
  // copied out of this page stops working almost immediately — which is the
  // point when the files are a client's logo and staff photos.
  const signed = await Promise.all(
    files.map(async (f) => ({ file: f, url: await signedFileUrl(f.storage_path) }))
  );

  const missing = missingRequirements(intake, files);
  const expired =
    intake.status !== "submitted" &&
    new Date(intake.token_expires_at).getTime() < Date.now();

  const socials = Object.entries(intake.social_links ?? {}).filter(([, v]) => v);

  return (
    <>
      <header className="ad-head">
        <p className="ad-crumb">
          <Link href="/admin/intakes" className="ad-link">
            ← Client intake
          </Link>
        </p>
        <h1>{intake.business_name || "Unnamed intake"}</h1>
        <p>
          {intake.status === "submitted" ? (
            <>
              Submitted{" "}
              {intake.submitted_at
                ? new Date(intake.submitted_at).toLocaleString()
                : ""}
              {" · "}
              {files.length} file{files.length === 1 ? "" : "s"}
            </>
          ) : (
            <>
              Step {intake.current_step} of 5 · {missing.length} still needed
              {expired ? " · link expired" : ""}
            </>
          )}
          {intake.job_id ? (
            <>
              {" · "}
              <Link href={`/admin/jobs/${intake.job_id}`} className="ad-link">
                open the job
              </Link>
            </>
          ) : null}
        </p>
      </header>

      <div className="ad-grid-2">
        <div>
          {missing.length > 0 ? (
            <section className="ad-panel">
              <h2 className="ad-panel-title">Still missing</h2>
              <ul className="ad-list">
                {missing.map((m) => (
                  <li key={m.field}>
                    {m.label} <span className="ad-muted">· step {m.step}</span>
                  </li>
                ))}
              </ul>
              <p className="ad-muted" style={{ marginTop: "0.75rem", fontSize: "0.8rem" }}>
                The client cannot submit until these are filled in. Nothing here
                has started the build clock.
              </p>
            </section>
          ) : null}

          {SECTIONS.map((section) => {
            const rows = section.fields
              .map((f) => [f, intake[f as keyof IntakeRecord]] as const)
              .filter(([, v]) => typeof v === "string" && v.length > 0);

            if (rows.length === 0) return null;

            return (
              <section className="ad-panel" key={section.title}>
                <h2 className="ad-panel-title">{section.title}</h2>
                <dl className="ad-dl">
                  {rows.map(([field, value]) => (
                    <div key={field}>
                      <dt>{FIELD_LABELS[field] ?? field}</dt>
                      <dd style={{ whiteSpace: "pre-wrap" }}>{value as string}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            );
          })}

          {socials.length > 0 ? (
            <section className="ad-panel">
              <h2 className="ad-panel-title">Social links</h2>
              <dl className="ad-dl">
                {socials.map(([key, url]) => (
                  <div key={key}>
                    <dt>{SOCIAL_NETWORKS.find((n) => n.key === key)?.label ?? key}</dt>
                    <dd>
                      <a href={url} target="_blank" rel="noopener noreferrer" className="ad-link">
                        {url}
                      </a>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
        </div>

        <div>
          <section className="ad-panel">
            <h2 className="ad-panel-title">Their link</h2>
            <p className="ad-muted" style={{ fontSize: "0.8rem", overflowWrap: "anywhere" }}>
              {intakeUrl(intake.token)}
            </p>
            <p className="ad-muted" style={{ fontSize: "0.75rem", marginTop: "0.5rem" }}>
              {intake.status === "submitted"
                ? "Submitted — the link now shows them their confirmation."
                : `Expires ${new Date(intake.token_expires_at).toLocaleDateString()}.`}
            </p>
            {intake.status !== "submitted" ? (
              <form action={extendIntakeLink} className="ad-inline-form" style={{ marginTop: "0.75rem" }}>
                <input type="hidden" name="intake_id" value={intake.id} />
                <button type="submit" className="ad-btn">
                  Give them another 30 days
                </button>
              </form>
            ) : null}
          </section>

          <section className="ad-panel">
            <h2 className="ad-panel-title">Files</h2>
            {files.length === 0 ? (
              <p className="ad-empty">Nothing uploaded yet.</p>
            ) : (
              FILE_KINDS.map((kind) => {
                const mine = signed.filter((s) => s.file.kind === kind.value);
                if (mine.length === 0) return null;
                return (
                  <div key={kind.value} style={{ marginBottom: "0.9rem" }}>
                    <div className="ad-muted" style={{ fontSize: "0.75rem", marginBottom: "0.35rem" }}>
                      {kind.label}
                    </div>
                    <ul className="ad-list">
                      {mine.map(({ file, url }) => (
                        <li key={file.id}>
                          {url ? (
                            <a href={url} target="_blank" rel="noopener noreferrer" className="ad-link">
                              {file.file_name}
                            </a>
                          ) : (
                            file.file_name
                          )}
                          {file.size_bytes ? (
                            <span className="ad-muted"> · {Math.round(file.size_bytes / 1024)} KB</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })
            )}
          </section>

          <section className="ad-panel">
            <h2 className="ad-panel-title">Acknowledged</h2>
            <ul className="ad-list">
              <li>
                {intake.attest_turnaround ? "✓" : "—"} Turnaround starts once we
                have everything
              </li>
              <li>
                {intake.attest_rights ? "✓" : "—"} Owns or has permission to use
                everything submitted
              </li>
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
