import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unwrap } from "./panel";
import {
  CLOSED_STATUSES,
  type Lead,
  type LeadStatus,
} from "@/lib/supabase/types";

/**
 * Section 3 — Sales Pipeline.
 *
 * The five stages the business talks about, mapped onto the nine statuses the
 * CRM actually stores. The mapping lives here and nowhere else, so renaming a
 * stage on the dashboard can never silently orphan a status.
 */

export type PipelineStageKey =
  | "new"
  | "qualified"
  | "discovery"
  | "proposal"
  | "won";

const STAGE_MAP: { key: PipelineStageKey; label: string; statuses: LeadStatus[] }[] = [
  { key: "new", label: "New Lead", statuses: ["New", "Contact Attempted"] },
  { key: "qualified", label: "Qualified", statuses: ["Contacted", "Qualified"] },
  { key: "discovery", label: "Discovery", statuses: ["Demo Scheduled"] },
  { key: "proposal", label: "Proposal", statuses: ["Proposal/Checkout Sent"] },
  { key: "won", label: "Won", statuses: ["Won"] },
];

export type PipelineStage = {
  key: PipelineStageKey;
  label: string;
  count: number;
  /** Cents from open invoices attached to leads in this stage. */
  valueCents: number;
  /** Share of the funnel sitting at or past this stage. null when empty. */
  sharePct: number | null;
  href: string;
  statuses: LeadStatus[];
};

export type Pipeline = {
  stages: PipelineStage[];
  totalInFunnel: number;
  totalValueCents: number;
  /** Won ÷ everything that ever entered the funnel, including Lost. */
  winRate: number | null;
  lost: number;
  parked: number;
};

export async function loadPipeline(sb: SupabaseClient): Promise<Pipeline> {
  const [statusRows, invoiceRows] = await Promise.all([
    sb
      .from("leads")
      .select("id, lead_status")
      .then((r) => unwrap(r, "lead statuses")),
    sb
      .from("invoices")
      .select("lead_id, kind, amount_cents, launch_cents")
      .in("status", ["draft", "sent"])
      .not("lead_id", "is", null)
      .then((r) => unwrap(r, "open invoices")),
  ]);

  type Row = { id: string; lead_status: LeadStatus };
  type Inv = {
    lead_id: string;
    kind: "launch" | "upsell";
    amount_cents: number;
    launch_cents: number;
  };

  const leads = statusRows as Row[];
  const valueByLead = new Map<string, number>();
  for (const inv of invoiceRows as Inv[]) {
    const cents = inv.kind === "launch" ? inv.launch_cents : inv.amount_cents;
    valueByLead.set(inv.lead_id, (valueByLead.get(inv.lead_id) ?? 0) + cents);
  }

  const statusToStage = new Map<LeadStatus, PipelineStageKey>();
  for (const s of STAGE_MAP) for (const st of s.statuses) statusToStage.set(st, s.key);

  const counts = new Map<PipelineStageKey, number>();
  const values = new Map<PipelineStageKey, number>();
  let lost = 0;
  let parked = 0;

  for (const lead of leads) {
    if (lead.lead_status === "Lost") {
      lost++;
      continue;
    }
    if (lead.lead_status === "Follow Up Later") {
      parked++;
      continue;
    }
    const key = statusToStage.get(lead.lead_status);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    values.set(key, (values.get(key) ?? 0) + (valueByLead.get(lead.id) ?? 0));
  }

  const totalInFunnel = STAGE_MAP.reduce((t, s) => t + (counts.get(s.key) ?? 0), 0);
  const won = counts.get("won") ?? 0;
  const everEntered = totalInFunnel + lost;

  const stages: PipelineStage[] = STAGE_MAP.map((s) => {
    const count = counts.get(s.key) ?? 0;
    return {
      key: s.key,
      label: s.label,
      count,
      valueCents: values.get(s.key) ?? 0,
      sharePct: totalInFunnel > 0 ? count / totalInFunnel : null,
      href: `/admin/leads?status=${encodeURIComponent(s.statuses[0])}`,
      statuses: s.statuses,
    };
  });

  return {
    stages,
    totalInFunnel,
    totalValueCents: STAGE_MAP.reduce((t, s) => t + (values.get(s.key) ?? 0), 0),
    winRate: everEntered > 0 ? won / everEntered : null,
    lost,
    parked,
  };
}

/* ─────────────────────────────────────────────────────────────────────── */

export type AttentionReason = "never_contacted" | "followup_due" | "gone_quiet";

export type LeadNeedingAttention = {
  id: string;
  name: string;
  business: string | null;
  services: string[];
  source: string;
  valueCents: number | null;
  lastContactedAt: string | null;
  createdAt: string;
  score: number;
  status: LeadStatus;
  reason: AttentionReason;
  nextAction: string;
  /** Ranks the list. Higher is louder. */
  urgency: number;
};

const HOURS = 3600_000;

/**
 * Leads the day should start with. Three real conditions, in priority order —
 * nothing here is a guess about intent, only about elapsed time.
 */
export async function loadLeadsNeedingAttention(
  sb: SupabaseClient,
  limit = 6
): Promise<LeadNeedingAttention[]> {
  const [leadRows, invoiceRows] = await Promise.all([
    sb
      .from("leads")
      .select(
        "id, first_name, last_name, business_name, services_interested, source, lead_status, lead_score, last_contacted_at, next_followup_at, created_at, do_not_contact"
      )
      .not("lead_status", "in", `(${CLOSED_STATUSES.join(",")})`)
      .eq("do_not_contact", false)
      .order("lead_score", { ascending: false })
      .limit(60)
      .then((r) => unwrap(r, "attention leads")),
    sb
      .from("invoices")
      .select("lead_id, kind, amount_cents, launch_cents")
      .in("status", ["draft", "sent"])
      .not("lead_id", "is", null)
      .then((r) => unwrap(r, "open invoices")),
  ]);

  const valueByLead = new Map<string, number>();
  for (const inv of invoiceRows as {
    lead_id: string;
    kind: "launch" | "upsell";
    amount_cents: number;
    launch_cents: number;
  }[]) {
    const cents = inv.kind === "launch" ? inv.launch_cents : inv.amount_cents;
    valueByLead.set(inv.lead_id, (valueByLead.get(inv.lead_id) ?? 0) + cents);
  }

  const now = Date.now();
  const out: LeadNeedingAttention[] = [];

  for (const l of leadRows as Pick<
    Lead,
    | "id"
    | "first_name"
    | "last_name"
    | "business_name"
    | "services_interested"
    | "source"
    | "lead_status"
    | "lead_score"
    | "last_contacted_at"
    | "next_followup_at"
    | "created_at"
  >[]) {
    const ageH = (now - new Date(l.created_at).getTime()) / HOURS;
    const sinceContactH = l.last_contacted_at
      ? (now - new Date(l.last_contacted_at).getTime()) / HOURS
      : null;
    const followupDue =
      l.next_followup_at !== null && new Date(l.next_followup_at).getTime() <= now;

    let reason: AttentionReason | null = null;
    let nextAction = "";
    let urgency = 0;

    if (!l.last_contacted_at && ageH >= 1) {
      reason = "never_contacted";
      nextAction = "First contact";
      // A brand-new lead that has never been touched is the loudest thing on
      // the dashboard, and gets louder by the hour.
      urgency = 1000 + Math.min(ageH, 240);
    } else if (followupDue) {
      reason = "followup_due";
      nextAction = "Follow-up is due";
      urgency = 700 + Math.min((now - new Date(l.next_followup_at!).getTime()) / HOURS, 240);
    } else if (sinceContactH !== null && sinceContactH >= 48) {
      reason = "gone_quiet";
      nextAction = "Check in";
      urgency = 400 + Math.min(sinceContactH, 240);
    }

    if (!reason) continue;

    out.push({
      id: l.id,
      name: `${l.first_name} ${l.last_name}`.trim(),
      business: l.business_name,
      services: l.services_interested ?? [],
      source: l.source,
      valueCents: valueByLead.get(l.id) ?? null,
      lastContactedAt: l.last_contacted_at,
      createdAt: l.created_at,
      score: l.lead_score,
      status: l.lead_status,
      reason,
      nextAction,
      urgency: urgency + l.lead_score,
    });
  }

  return out.sort((a, b) => b.urgency - a.urgency).slice(0, limit);
}
