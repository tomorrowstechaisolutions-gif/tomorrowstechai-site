import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { systemEmail } from "@/lib/system-emails/registry";
import { emailCopy } from "@/lib/system-emails/store";
import { resetEmailCopyAction, saveEmailCopyAction, sendTestEmailAction } from "@/app/admin/system-email-actions";
import SystemEmailEditor from "@/components/admin/cc/system-emails/SystemEmailEditor";
import fin from "@/components/admin/cc/finance/finance.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit email" };

const AUDIENCE = { client: "the client", member: "the member", lead: "the lead", owner: "you" } as const;

export default async function SystemEmailPage({ params, searchParams }: {
  params: Promise<{ key: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { key: raw } = await params;
  const key = decodeURIComponent(raw);
  const def = systemEmail(key);
  if (!def) notFound();
  const sp = await searchParams;
  const saved = await emailCopy(key);
  const edited = Object.keys(saved).length;

  return (
    <>
      <div className="cc-greet">
        <div>
          <p style={{ margin: 0 }}><Link href="/admin/system/emails" className="cc-link">← System emails</Link></p>
          <h1>{def.name}</h1>
          <p>{def.module} · goes to {AUDIENCE[def.audience]} · {def.trigger}</p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <form action={sendTestEmailAction}>
            <input type="hidden" name="key" value={def.key} />
            <button className={fin.btn}>Send test to me</button>
          </form>
          {edited ? (
            <form action={resetEmailCopyAction}>
              <input type="hidden" name="key" value={def.key} />
              <button className={fin.btn}>Reset to original</button>
            </form>
          ) : null}
        </div>
      </div>
      {typeof sp.notice === "string" ? <div className={fin.flashOk}>{sp.notice}</div> : null}
      {typeof sp.error === "string" ? <div className={fin.flashErr}>{sp.error}</div> : null}

      <section className="cc-panel" style={{ padding: 16 }}>
        <SystemEmailEditor emailKey={def.key} saved={saved as Record<string, string>} saveAction={saveEmailCopyAction} />
      </section>
    </>
  );
}
