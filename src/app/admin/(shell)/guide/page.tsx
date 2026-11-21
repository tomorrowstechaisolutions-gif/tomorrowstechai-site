import Link from "next/link";
import { redirect } from "next/navigation";
import GuideRecorder from "@/components/guide/GuideRecorder";
import { voiceConfigured } from "@/lib/crew/voice";
import { clipUrls } from "@/lib/guide/clips";
import { GUIDE_STEPS, scriptProblems } from "@/lib/guide/script";
import { getAdminUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Site Guide" };
// Recording every line in one go takes longer than a normal request.
export const maxDuration = 300;

export default async function SiteGuidePage() {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");
  const clips = await clipUrls();
  const problems = scriptProblems();
  const missing = GUIDE_STEPS.filter((s) => !clips[s.id]).length;
  const characters = GUIDE_STEPS.filter((s) => !clips[s.id]).reduce((sum, s) => sum + s.say.length, 0);

  return (
    <>
      <div className="cc-greet">
        <div>
          <h1>Site Guide</h1>
          <p>What Tess says to visitors on the public site. Each line is recorded once in her voice and replayed, so a visit costs nothing.</p>
        </div>
        <div className="sv-actions"><Link href="/guide" className="cc-btn" target="_blank">Open her page</Link></div>
      </div>
      {problems.length ? <div className="cc-error" role="alert"><strong>The script has a problem.</strong><ul style={{ margin: "6px 0 0 18px" }}>{problems.map((p) => <li key={p}>{p}</li>)}</ul></div> : null}
      <section className="cc-panel" style={{ padding: 16, marginBottom: 12 }}>
        <p style={{ margin: "0 0 10px" }}>
          {missing === 0 ? `All ${GUIDE_STEPS.length} lines are recorded.` : `${missing} of ${GUIDE_STEPS.length} lines have no recording yet (about ${characters.toLocaleString("en-US")} characters of speech). Until a line is recorded, visitors see its words without her voice.`}
        </p>
        <GuideRecorder canRecord={["owner", "admin"].includes(session.admin.role)} voiceReady={voiceConfigured()} missing={missing} />
      </section>
      <section className="cc-panel" style={{ padding: 16 }}>
        <table className="cc-table" style={{ width: "100%" }}>
          <thead><tr><th style={{ textAlign: "left" }}>Step</th><th style={{ textAlign: "left" }}>She says</th><th style={{ textAlign: "left" }}>Answers or offer</th><th style={{ textAlign: "left" }}>Recording</th></tr></thead>
          <tbody>
            {GUIDE_STEPS.map((s) => (
              <tr key={s.id}>
                <td style={{ whiteSpace: "nowrap", verticalAlign: "top" }}>{s.id}</td>
                <td style={{ verticalAlign: "top" }}>{s.say}</td>
                <td style={{ verticalAlign: "top" }}>{s.kind === "question" ? s.options.map((o) => o.label).join(" · ") : s.kind === "outcome" ? `${s.offer} → ${s.href}` : "Name, email, phone"}</td>
                <td style={{ verticalAlign: "top", whiteSpace: "nowrap" }}>{clips[s.id] ? <audio controls preload="none" src={clips[s.id]} style={{ height: 30 }} /> : "Not recorded"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
