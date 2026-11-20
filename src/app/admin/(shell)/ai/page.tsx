import type { Metadata } from "next";
import { redirect } from "next/navigation";
import TessConsole from "@/components/admin/cc/tess/TessConsole";
import styles from "@/components/admin/cc/tess/tess.module.css";
import { buildBrief, visitSince, type Brief } from "@/lib/crew/brief";
import { chatHistory, type ChatLine } from "@/lib/crew/chat";
import { loadTessProfile, type TessProfile } from "@/lib/crew/profile";
import { voiceConfigured } from "@/lib/crew/voice";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Tess" };
export const dynamic = "force-dynamic";

/**
 * Tess: the lead AI. The brief is built on the server for this visit, from
 * the crew's own step log and the same snapshot the advisor reads, and handed
 * to the console as it stands. The conversation happens over
 * /api/admin/tess/chat.
 */
export default async function TessPage() {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");

  let brief: Brief | null = null;
  let history: ChatLine[] = [];
  let profile: TessProfile | null = null;
  let failure: string | null = null;
  try {
    const sb = supabaseAdmin();
    const since = await visitSince(sb, session.user.id);
    [brief, history, profile] = await Promise.all([buildBrief(sb, since), chatHistory(sb, session.user.id), loadTessProfile(sb, session.user.id)]);
  } catch (err) {
    console.error("[tess] could not build the brief:", err);
    failure = err instanceof Error ? err.message : "unknown error";
  }

  if (!brief || !brief.business || !profile) {
    return (
      <div className={styles.root}>
        <div className={styles.missing}>
          <h1>Tess</h1>
          <p>Tess and the crew are built, but their tables are not in the database yet. Run the crew migration (20261120010000_ai_crew.sql) in Supabase and reload this page.</p>
          {failure ? <p>What the database said: {failure}</p> : null}
        </div>
      </div>
    );
  }

  return <TessConsole brief={brief} history={history} profile={profile} voice={voiceConfigured()} />;
}
