import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadKpis } from "./kpis";
import { loadPipeline, loadLeadsNeedingAttention } from "./sales";
import { loadProjects } from "./projects";
import { loadMarketing } from "./marketing";
import { loadFinance } from "./finance";
import { loadServicePerformance } from "./services";
import { loadWeb } from "./web";
import { loadSocial } from "./social";
import { loadToday } from "./today";
import { chicagoDate } from "./period";

/**
 * The read-only snapshot the AI advisor is allowed to see.
 *
 * Built entirely on the server from the same loaders the dashboard uses. The
 * browser never sends business data up with a question — a request body is
 * something a caller controls, and an advisor that answers from numbers the
 * caller supplied is answering a question about fiction.
 *
 * Nothing personally identifying goes in: no lead emails, phone numbers or
 * addresses. The model gets shapes and totals, which is what a question about
 * the business actually needs.
 */

export type AdvisorContext = {
  asOf: string;
  snapshot: string;
};

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US")}`;
const pct = (n: number | null) => (n === null ? "not measurable yet" : `${(n * 100).toFixed(1)}%`);

export async function buildAdvisorContext(sb: SupabaseClient): Promise<AdvisorContext> {
  const [kpis, pipeline, attention, projects, marketing, finance, services, web, social, today] =
    await Promise.all([
      loadKpis(sb).catch(() => null),
      loadPipeline(sb).catch(() => null),
      loadLeadsNeedingAttention(sb, 8).catch(() => null),
      loadProjects(sb, 12).catch(() => null),
      loadMarketing(sb).catch(() => null),
      loadFinance(sb).catch(() => null),
      loadServicePerformance(sb).catch(() => null),
      loadWeb(sb).catch(() => null),
      loadSocial(sb).catch(() => null),
      loadToday(sb).catch(() => null),
    ]);

  const lines: string[] = [];
  const section = (title: string) => lines.push(``, `## ${title}`);

  lines.push(`Business snapshot for Tomorrow's Tech AI, ${chicagoDate()} (America/Chicago).`);
  lines.push(
    `Anything absent below is genuinely not measured yet. Do not estimate it, and say so if it is needed to answer.`
  );

  if (kpis) {
    section("Headline numbers (this month to date)");
    for (const k of kpis) {
      const value = k.format === "money" ? money(k.value) : String(k.value);
      const delta =
        k.delta === null
          ? ""
          : ` (${k.delta > 0 ? "+" : ""}${(k.delta * 100).toFixed(1)}% vs the same days last month)`;
      lines.push(`- ${k.label}: ${value}${delta}. ${k.hint ?? ""}`);
    }
  }

  if (pipeline) {
    section("Pipeline");
    lines.push(`- ${pipeline.totalInFunnel} leads in the funnel, ${pipeline.lost} lost, ${pipeline.parked} parked.`);
    lines.push(`- Win rate to date: ${pct(pipeline.winRate)}.`);
    for (const s of pipeline.stages) {
      lines.push(`- ${s.label}: ${s.count} leads${s.valueCents > 0 ? `, ${money(s.valueCents)} in open checkout links` : ""}.`);
    }
  }

  if (attention && attention.length > 0) {
    section("Leads needing attention (no names — refer to them by business)");
    for (const l of attention) {
      lines.push(
        `- ${l.business ?? "unnamed business"} — ${l.status}, score ${l.score}, source ${l.source}, interested in ${
          l.services.join(", ") || "unspecified"
        }. ${l.nextAction}. Last contact: ${l.lastContactedAt ?? "never"}.`
      );
    }
  }

  if (projects) {
    section("Active projects");
    lines.push(`- ${projects.total} active, ${projects.atRisk} past their promised date.`);
    for (const p of projects.rows) {
      lines.push(
        `- ${p.client ?? p.title} — ${p.typeLabel}, ${p.status}, ${
          p.progress === null ? "no checklist" : `${Math.round(p.progress * 100)}% of checklist done`
        }, due ${p.dueAt ?? "no date"}, value ${money(p.valueCents)}.`
      );
    }
  }

  if (marketing) {
    const m = marketing.metrics;
    section("Marketing (this month)");
    if (marketing.noSpend) {
      lines.push(`- No ad spend has been recorded this month.`);
    } else {
      lines.push(
        `- Spend ${money(Math.round(m.adSpend * 100))}, ${m.leads} leads, cost per lead ${
          m.costPerLead === null ? "not measurable" : `$${m.costPerLead.toFixed(2)}`
        }, ROAS ${m.roas === null ? "not measurable" : `${m.roas.toFixed(2)}x`}.`
      );
      for (const c of marketing.campaigns) {
        lines.push(
          `- ${c.campaign}: ${money(c.spendCents)} spend, ${c.leads} leads, ${money(c.revenueCents)} revenue, CPL ${
            c.costPerLeadCents === null ? "n/a" : money(Math.round(c.costPerLeadCents))
          }.`
        );
      }
    }
  }

  if (finance) {
    section("Finance (this month)");
    lines.push(`- Revenue ${money(finance.revenueCents)}, MRR ${money(finance.mrrCents)}.`);
    lines.push(
      `- Outstanding: ${money(finance.outstandingCents)} across ${finance.outstandingCount} unpaid checkout links.`
    );
    lines.push(
      `- Costs: ${money(finance.expensesCents)} expenses plus ${money(finance.adSpendCents)} ad spend. Net ${money(finance.netCents)}.`
    );
    if (finance.projectedCents !== null) {
      lines.push(`- Straight-line month-end projection: ${money(finance.projectedCents)}.`);
    }
  }

  if (services && services.length > 0) {
    section("Service lines (this month)");
    for (const s of services) {
      lines.push(
        `- ${s.label}: ${s.leads} leads, ${s.sales} sales, ${money(s.revenueCents)} revenue, conversion ${pct(s.conversion)}.`
      );
    }
  }

  if (web) {
    section("Website");
    lines.push(
      web.analyticsConnected
        ? `- Server-side analytics is connected.`
        : `- Visitor and page-view counts are NOT available: GA4 and the Meta Pixel are browser-side only and nothing on the server reads them back. Do not quote traffic numbers.`
    );
    lines.push(`- ${web.leadsMonth} leads this month, ${web.leadsToday} today.`);
    if (web.paidLandingViews > 0) {
      lines.push(`- Paid landing-page views ${web.paidLandingViews}, converting at ${pct(web.conversionRate)}.`);
    }
    if (web.topSources.length > 0) {
      lines.push(`- Top lead sources: ${web.topSources.map((s) => `${s.label} (${s.count})`).join(", ")}.`);
    }
    if (web.topLandingPages.length > 0) {
      lines.push(`- Top landing pages: ${web.topLandingPages.map((s) => `${s.label} (${s.count})`).join(", ")}.`);
    }
  }

  if (social) {
    section("Social");
    if (social.connectedCount === 0) {
      lines.push(
        `- No social accounts are connected. There are no follower, reach or engagement figures to reason about. Do not invent any.`
      );
    } else {
      for (const c of social.channels.filter((c) => c.connected)) {
        lines.push(
          `- ${c.label}: ${c.followers ?? "followers not synced"}, reach ${c.reach ?? "not synced"}, leads ${c.leads ?? "not synced"}.`
        );
      }
    }
    lines.push(`- ${social.scheduledCount} posts scheduled, ${social.awaitingApproval} awaiting approval.`);
  }

  if (today) {
    section("Today");
    lines.push(`- ${today.items.length} things due, ${today.overdueCount} of them overdue.`);
    for (const t of today.items.slice(0, 10)) {
      lines.push(`- [${t.kind}] ${t.title}${t.overdue ? " (OVERDUE)" : ""}`);
    }
  }

  return { asOf: new Date().toISOString(), snapshot: lines.join("\n") };
}
