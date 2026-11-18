import Link from "next/link";
import type { Metadata } from "next";
import { loadIntegrations, type Category, type Integration, type IntegrationState } from "@/lib/integrations/status";
import { Panel, ErrorState } from "@/components/admin/cc/Panel";
import { IconAlert } from "@/components/admin/cc/Icons";
import fin from "@/components/admin/cc/finance/finance.module.css";
import styles from "@/components/admin/cc/finance/integrations.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Integrations" };

/**
 * Integrations. Every outside service the site depends on, with a status
 * read from what each module records (syncs, errors, connected accounts,
 * provider checks), which keys are set, and where to manage it.
 */

const STATE: Record<IntegrationState, { label: string; tone: string }> = {
  connected: { label: "Connected", tone: "t-ok" },
  attention: { label: "Needs attention", tone: "t-warn" },
  keys_set: { label: "Keys set", tone: "t-info" },
  not_set_up: { label: "Not set up", tone: "t-muted" },
};
const ORDER: Category[] = ["Payments & money", "Email", "Social publishing", "Ads & tracking", "Google", "AI models", "Meetings", "Hosting & code", "Partners", "Core"];
const FILTERS = { all: "All", attention: "Needs attention", connected: "Connected", keys_set: "Keys set", not_set_up: "Not set up" } as const;
type Filter = keyof typeof FILTERS;

const when = (iso: string | null) => iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }) : null;

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const filter: Filter = typeof params.show === "string" && params.show in FILTERS ? (params.show as Filter) : "all";

  let list: Integration[] = [];
  let error: string | null = null;
  try {
    list = await loadIntegrations();
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Integrations could not be loaded.";
  }

  const count = (s: IntegrationState) => list.filter((i) => i.state === s).length;
  const shown = filter === "all" ? list : list.filter((i) => i.state === filter);
  const kpis = [
    { label: "Connected", value: count("connected"), foot: "Working, with a live record" },
    { label: "Needs attention", value: count("attention"), foot: "Broken, half set up, or stale", warn: count("attention") > 0 },
    { label: "Keys set", value: count("keys_set"), foot: "Configured; no live check yet" },
    { label: "Not set up", value: count("not_set_up"), foot: "Optional until you need them" },
  ];

  return (
    <>
      <div className="cc-greet">
        <div>
          <h1>Integrations</h1>
          <p>Every outside service the site runs on, whether it&apos;s actually working, and where to fix it.</p>
        </div>
      </div>
      {error ? <ErrorState message={error} /> : (
        <>
          <div className="cc-kpis">
            {kpis.map((k) => (
              <Link key={k.label} href={`/admin/system/integrations?show=${k.label === "Connected" ? "connected" : k.label === "Needs attention" ? "attention" : k.label === "Keys set" ? "keys_set" : "not_set_up"}`} className="cc-kpi" style={{ textDecoration: "none", color: "inherit" }}>
                <div className="cc-kpi-top"><span className="cc-kpi-label">{k.label}</span></div>
                <span className="cc-kpi-value" style={k.warn ? { color: "#FBBF24" } : undefined}>{k.value}</span>
                <div className="cc-kpi-foot"><span>{k.foot}</span></div>
              </Link>
            ))}
          </div>

          <div className="cc-board" style={{ marginTop: 16 }}>
            <section className="cc-panel cc-s12" style={{ padding: 16 }}>
              <div className={styles.filters} role="group" aria-label="Show">
                {(Object.keys(FILTERS) as Filter[]).map((f) => (
                  <Link key={f} href={f === "all" ? "/admin/system/integrations" : `/admin/system/integrations?show=${f}`} className={`${styles.chip} ${f === filter ? styles.on : ""}`}>
                    {FILTERS[f]}{f !== "all" ? ` · ${count(f)}` : ` · ${list.length}`}
                  </Link>
                ))}
              </div>
              {ORDER.map((cat) => {
                const items = shown.filter((i) => i.category === cat);
                if (!items.length) return null;
                return (
                  <div key={cat} className={styles.group}>
                    <h2 className={styles.groupHead}>{cat}</h2>
                    <div className={styles.grid}>{items.map((i) => <Card key={i.key} i={i} />)}</div>
                  </div>
                );
              })}
              {!shown.length ? <p className={fin.note}>Nothing in this group.</p> : null}
            </section>

            <Panel title="How to read this" icon={<IconAlert size={15} />} className="cc-s12">
              <p className={fin.note} style={{ marginTop: 0 }}>
                <b>Connected</b> means the service has a live record here: a recent sync, a connected account, a passing provider check, or a payment or lead received through it.<br />
                <b>Keys set</b> means it&apos;s configured but nothing here can prove it&apos;s working yet (for example the Meta Pixel, which only Meta&apos;s Events Manager can confirm).<br />
                <b>Needs attention</b> means something is broken, half set up, or hasn&apos;t synced when it should have.<br />
                Keys are added in Vercel → Settings → Environment Variables, followed by a redeploy. This page only shows whether each named key is set, never its value. Dimmed key names are optional.
              </p>
            </Panel>
          </div>
        </>
      )}
    </>
  );
}

function Card({ i }: { i: Integration }) {
  const s = STATE[i.state];
  const external = i.manage?.href.startsWith("http");
  return (
    <article className={`${styles.card} ${styles[i.state]}`}>
      <div className={styles.top}>
        <span className={styles.name}>{i.name}</span>
        <span className={`cc-chip ${s.tone}`}>{s.label}</span>
      </div>
      <p className={styles.purpose}>{i.purpose}</p>
      <p className={styles.detail}>{i.detail}</p>
      {i.lastActivity && i.lastActivityLabel ? <span className={styles.when}>{i.lastActivityLabel}: {when(i.lastActivity)}</span> : null}
      {i.envs.length ? (
        <ul className={styles.envs} aria-label="Keys">
          {i.envs.map((e) => (
            <li key={e.name} className={`${e.set ? styles.set : e.optional ? "" : styles.unset} ${e.optional && !e.set ? styles.opt : ""}`} title={e.set ? "Set" : e.optional ? "Optional, not set" : "Not set"}>
              {e.set ? "✓ " : ""}{e.name}
            </li>
          ))}
        </ul>
      ) : null}
      {i.manage ? (
        external
          ? <a className={styles.manage} href={i.manage.href} target="_blank" rel="noreferrer">{i.manage.label} ↗</a>
          : <Link className={styles.manage} href={i.manage.href}>{i.manage.label} →</Link>
      ) : null}
    </article>
  );
}
