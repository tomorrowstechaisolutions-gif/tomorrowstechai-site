import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { missingRequirements, type IntakeFile, type IntakeRecord } from "@/lib/intake/config";
import { startStarterJob } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

export default async function IntakesPage() {
  const supabase = await createSupabaseServerClient();

  const { data: intakeRows } = await supabase
    .from("client_intakes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  const intakes = (intakeRows ?? []) as IntakeRecord[];

  const { data: fileRows } = await supabase
    .from("intake_files")
    .select("id, intake_id, kind");

  const files = (fileRows ?? []) as Pick<IntakeFile, "id" | "intake_id" | "kind">[];

  const waiting = intakes.filter((i) => i.status === "draft").length;
  const ready = intakes.filter((i) => i.status === "submitted").length;

  return (
    <>
      <header className="ad-head">
        <h1>Client intake</h1>
        <p>
          Every Starter site waiting on content, and every one that has sent it.
          A build clock does not start until an intake here is submitted and
          checked.
        </p>
      </header>

      <div className="ad-filters">
        <span className="ad-muted" style={{ alignSelf: "center" }}>
          {waiting} waiting on the client · {ready} submitted
        </span>
      </div>

      <section className="ad-panel">
        <h2 className="ad-panel-title">Start a Starter job</h2>
        <p className="ad-muted" style={{ fontSize: "0.8rem", marginBottom: "0.75rem" }}>
          For a $149 sale taken over the phone or by invoice. Opens the job at
          Purchased and issues the client&rsquo;s intake link. Once the $149
          Stripe price exists, this happens by itself.
        </p>
        <form action={startStarterJob} className="ad-inline-form">
          <input name="business_name" className="ad-input" placeholder="Business name" required />
          <input name="contact_name" className="ad-input" placeholder="Contact name" />
          <input name="email" type="email" className="ad-input" placeholder="Email" />
          <input name="phone" type="tel" className="ad-input" placeholder="Phone" />
          <button type="submit" className="ad-btn">Open intake</button>
        </form>
      </section>

      {intakes.length === 0 ? (
        <section className="ad-panel">
          <p className="ad-empty">
            No intakes yet. One opens when a Starter job is created and you
            issue the client their link.
          </p>
        </section>
      ) : (
        <section className="ad-panel">
          <div className="ad-table-scroll">
            <table className="ad-table">
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Contact</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th>Files</th>
                  <th>Opened</th>
                </tr>
              </thead>
              <tbody>
                {intakes.map((intake) => {
                  const mine = files.filter((f) => f.intake_id === intake.id);
                  const missing = missingRequirements(
                    intake,
                    mine as Pick<IntakeFile, "kind">[]
                  );
                  const expired =
                    intake.status !== "submitted" &&
                    new Date(intake.token_expires_at).getTime() < Date.now();

                  return (
                    <tr key={intake.id}>
                      <td>
                        <Link href={`/admin/intakes/${intake.id}`} className="ad-link">
                          {intake.business_name || "Unnamed"}
                        </Link>
                      </td>
                      <td>
                        {intake.contact_name || <span className="ad-muted">—</span>}
                        {intake.email ? (
                          <div className="ad-muted" style={{ fontSize: "0.75rem" }}>
                            {intake.email}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        {intake.status === "submitted" ? (
                          <span className="ad-tag s-live">Submitted</span>
                        ) : expired ? (
                          <span className="ad-tag s-late">Link expired</span>
                        ) : (
                          <span className="ad-tag s-soon">Waiting on client</span>
                        )}
                      </td>
                      <td>
                        {intake.status === "submitted" ? (
                          "Complete"
                        ) : (
                          <>
                            Step {intake.current_step} of 5
                            <div className="ad-muted" style={{ fontSize: "0.75rem" }}>
                              {missing.length} still needed
                            </div>
                          </>
                        )}
                      </td>
                      <td>{mine.length}</td>
                      <td>{new Date(intake.created_at).toLocaleDateString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
