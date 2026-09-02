import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { listAgreements } from "@/lib/proposals/agreement";
import {
  archiveAgreementVersionAction,
  publishAgreementVersionAction,
  saveAgreementVersionAction,
} from "@/app/admin/proposal-actions";
import { IconFile, IconAlert } from "@/components/admin/cc/Icons";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Agreements" };

/**
 * The contract, editable without a deploy.
 *
 * Wording is never edited in place once a proposal points at it. Saving
 * against a published version creates a NEW draft instead, because changing
 * the text under a signature would destroy the only thing that makes a
 * signature mean anything.
 */
export default async function AgreementsPage() {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");

  const supabase = await createSupabaseServerClient();
  const versions = await listAgreements(supabase);

  const usage = new Map<string, number>();
  for (const version of versions) {
    const { count } = await supabase
      .from("proposals")
      .select("id", { count: "exact", head: true })
      .eq("agreement_version_id", version.id);
    usage.set(version.id, count ?? 0);
  }

  const latest = versions.find((v) => v.status === "published") ?? versions[0] ?? null;

  return (
    <>
      <div className="cc-greet">
        <div>
          <h1>Agreements</h1>
          <p>
            The Website Development, Hosting &amp; Software License Agreement,
            stored as data. Every proposal pins the version it was written
            against, and every signature records the version it was signed
            under.
          </p>
        </div>
        <Link href="/admin/settings" className="cc-btn">Back to settings</Link>
      </div>

      <div className="cc-board">
        <section className="cc-panel cc-s12">
          <div className="cc-panel-head">
            <IconFile size={15} />
            <h2>Versions</h2>
            <span className="cc-sub">{versions.length} on file</span>
          </div>
          <div className="cc-scroll">
            <table className="cc-table dense">
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th className="num">Clauses</th>
                  <th className="num">Used by</th>
                  <th>Published</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((version) => (
                  <tr key={version.id}>
                    <td className="cc-strong">v{version.version}</td>
                    <td>{version.title}</td>
                    <td>
                      <span
                        className={`cc-chip ${
                          version.status === "published"
                            ? "t-ok"
                            : version.status === "draft"
                              ? "t-info"
                              : "t-muted"
                        }`}
                      >
                        {version.status}
                      </span>
                    </td>
                    <td className="num">{version.sections.length}</td>
                    <td className="num">{usage.get(version.id) ?? 0}</td>
                    <td>
                      {version.published_at
                        ? new Date(version.published_at).toLocaleDateString("en-US", {
                            month: "short", day: "numeric", year: "numeric",
                          })
                        : "—"}
                    </td>
                    <td>
                      <div className="cc-rowacts">
                        {version.status !== "published" ? (
                          <form action={publishAgreementVersionAction}>
                            <input type="hidden" name="agreement_id" value={version.id} />
                            <button type="submit" className="cc-btn">Publish</button>
                          </form>
                        ) : null}
                        {version.status === "published" ? (
                          <form action={archiveAgreementVersionAction}>
                            <input type="hidden" name="agreement_id" value={version.id} />
                            <button type="submit" className="cc-btn">Archive</button>
                          </form>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="cc-panel-foot">
            <span className="cc-faint" style={{ fontSize: "0.73rem" }}>
              New proposals attach the most recently published version.
              Archiving never affects a proposal that already pinned it.
            </span>
          </div>
        </section>

        <section className="cc-panel cc-s12">
          <div className="cc-panel-head">
            <IconAlert size={15} />
            <h2>Edit the wording</h2>
            <span className="cc-sub">Saves as a new draft version</span>
          </div>
          <div className="cc-panel-body">
            <p className="cc-note" style={{ marginTop: 0 }}>
              The clause list is JSON so the numbering, headings, paragraphs and
              bullet lists all survive intact. Each entry is{" "}
              <code>{`{ "n": "1", "heading": "…", "paragraphs": ["…"], "bullets": ["…"] }`}</code>.
              Ownership rows are{" "}
              <code>{`{ "asset": "…", "owner": "…", "treatment": "…" }`}</code>.
              Nothing here changes a proposal that has already been signed.
            </p>

            <form action={saveAgreementVersionAction}>
              <div className="cc-field row2">
                <span>
                  <label className="cc-label" htmlFor="version">Version number</label>
                  <input
                    id="version" name="version" className="cc-input" required
                    defaultValue="" placeholder="1.1"
                  />
                </span>
                <span>
                  <label className="cc-label" htmlFor="title">Title</label>
                  <input
                    id="title" name="title" className="cc-input" required
                    defaultValue={latest?.title ?? "Website Development, Hosting & Software License Agreement"}
                  />
                </span>
              </div>

              <div className="cc-field">
                <label className="cc-label" htmlFor="intro">Preamble</label>
                <textarea
                  id="intro" name="intro" className="cc-textarea" rows={8}
                  defaultValue={latest?.intro ?? ""}
                />
              </div>

              <div className="cc-field">
                <label className="cc-label" htmlFor="sections_json">Clauses (JSON)</label>
                <textarea
                  id="sections_json" name="sections_json" className="cc-textarea" rows={18}
                  spellCheck={false}
                  defaultValue={JSON.stringify(latest?.sections ?? [], null, 2)}
                />
              </div>

              <div className="cc-field">
                <label className="cc-label" htmlFor="ownership_json">Exhibit B — ownership rows (JSON)</label>
                <textarea
                  id="ownership_json" name="ownership_json" className="cc-textarea" rows={12}
                  spellCheck={false}
                  defaultValue={JSON.stringify(latest?.ownership_rows ?? [], null, 2)}
                />
              </div>

              <button type="submit" className="cc-btn primary">Save as a new draft</button>
              <span className="cc-note">
                A draft is not used by anything until you publish it.
              </span>
            </form>
          </div>
        </section>
      </div>
    </>
  );
}
