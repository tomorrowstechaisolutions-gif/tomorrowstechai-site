import Link from "next/link";
import type { Metadata } from "next";
import { SYSTEM_EMAILS } from "@/lib/system-emails/registry";
import { editedEmailKeys } from "@/lib/system-emails/store";
import type { EmailAudience, SystemEmailDef } from "@/lib/system-emails/types";
import { Panel } from "@/components/admin/cc/Panel";
import { IconAlert, IconMail } from "@/components/admin/cc/Icons";
import fin from "@/components/admin/cc/finance/finance.module.css";
import styles from "@/components/admin/cc/system-emails/system-emails.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "System emails" };

/** Every automated email the site sends, with what triggers it and a way to view and edit it. */

const AUDIENCE: Record<EmailAudience, { label: string; tone: string }> = {
  client: { label: "To client", tone: "t-info" },
  member: { label: "To member", tone: "t-info" },
  lead: { label: "To lead", tone: "t-ok" },
  owner: { label: "To you", tone: "t-warn" },
};

export default async function SystemEmailsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const edited = await editedEmailKeys();
  const modules = [...new Set(SYSTEM_EMAILS.map((e) => e.module))];
  const show = typeof params.show === "string" ? params.show : "all";
  const filter = (e: SystemEmailDef) => show === "all" || (show === "edited" ? edited.has(e.key) : e.audience === show);

  return (
    <>
      <div className="cc-greet">
        <div>
          <h1>System emails</h1>
          <p>Every email the site sends on its own. Open one to see exactly how it looks and change the wording.</p>
        </div>
      </div>
      {typeof params.error === "string" ? <div className={fin.flashErr}>{params.error}</div> : null}

      <div className="cc-kpis">
        {[
          { label: "Automated emails", value: SYSTEM_EMAILS.length, foot: `${modules.length} areas of the site` },
          { label: "To clients & leads", value: SYSTEM_EMAILS.filter((e) => e.audience !== "owner").length, foot: "What your customers receive" },
          { label: "To you", value: SYSTEM_EMAILS.filter((e) => e.audience === "owner").length, foot: "Switch these on/off in Notifications" },
          { label: "Edited", value: edited.size, foot: edited.size ? "Using your wording" : "All on original wording" },
        ].map((k) => (
          <div key={k.label} className="cc-kpi">
            <div className="cc-kpi-top"><span className="cc-kpi-label">{k.label}</span></div>
            <span className="cc-kpi-value">{k.value}</span>
            <div className="cc-kpi-foot"><span>{k.foot}</span></div>
          </div>
        ))}
      </div>

      <div className="cc-board" style={{ marginTop: 16 }}>
        <Panel title="Emails" sub={`${SYSTEM_EMAILS.filter(filter).length} shown`} icon={<IconMail size={15} />} className="cc-s8">
          <div className={fin.bankHead} style={{ justifyContent: "flex-start", gap: 6, flexWrap: "wrap" }}>
            {[["all", "All"], ["client", "To clients"], ["lead", "To leads"], ["member", "To members"], ["owner", "To you"], ["edited", "Edited"]].map(([k, l]) => (
              <Link key={k} href={k === "all" ? "/admin/system/emails" : `/admin/system/emails?show=${k}`} className={`cc-chip ${show === k ? "t-info" : "t-muted"}`} style={{ textDecoration: "none" }}>{l}</Link>
            ))}
          </div>
          {modules.map((m) => {
            const list = SYSTEM_EMAILS.filter((e) => e.module === m && filter(e));
            if (!list.length) return null;
            return (
              <div key={m} className={styles.module}>
                <h3 className={styles.moduleHead}>{m}</h3>
                {list.map((e) => {
                  const a = AUDIENCE[e.audience];
                  const ed = edited.get(e.key);
                  return (
                    <Link key={e.key} href={`/admin/system/emails/${encodeURIComponent(e.key)}`} className={styles.item}>
                      <div>
                        <b>{e.name}</b>
                        <small>{e.trigger}</small>
                      </div>
                      <span className={styles.tags}>
                        {ed ? <span className="cc-chip t-warn">Edited · {ed.slots}</span> : null}
                        <span className={`cc-chip ${a.tone}`}>{a.label}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </Panel>

        <Panel title="How editing works" icon={<IconAlert size={15} />} className="cc-s4">
          <p className={fin.note} style={{ marginTop: 0 }}>
            <b>You edit the words</b>: subject, headings, paragraphs and button text. The branded layout, your signature, amounts, item lists and links are filled in by the system, so a wording change can never break an invoice or a link.<br />
            <b>Fill-ins</b> like <code>{"{first_name}"}</code> or <code>{"{invoice_number}"}</code> are replaced with the real values when the email goes out. Each email lists the ones it supports.<br />
            <b>Preview</b> updates as you type, on desktop or phone, using sample data. <b>Send test</b> emails the saved version to you.<br />
            <b>Original</b> puts any part back to the shipped wording, and <b>Reset</b> puts the whole email back.<br />
            Changes go live within 30 seconds of saving.
          </p>
        </Panel>
      </div>
    </>
  );
}
