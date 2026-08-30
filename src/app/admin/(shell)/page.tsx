import { Suspense } from "react";
import { getAdminUser } from "@/lib/supabase/server";
import { greeting, todayLabel } from "@/components/admin/cc/format";
import { PanelSkeleton } from "@/components/admin/cc/Panel";
import KpiRow, { KpiRowSkeleton } from "@/components/admin/cc/panels/KpiRow";
import AdvisorPanel from "@/components/admin/cc/panels/AdvisorPanel";
import InsightsPanel from "@/components/admin/cc/panels/InsightsPanel";
import PipelinePanel from "@/components/admin/cc/panels/PipelinePanel";
import TodayPanel from "@/components/admin/cc/panels/TodayPanel";
import ProjectsPanel from "@/components/admin/cc/panels/ProjectsPanel";
import SocialPanel from "@/components/admin/cc/panels/SocialPanel";
import WebPanel from "@/components/admin/cc/panels/WebPanel";
import MarketingPanel from "@/components/admin/cc/panels/MarketingPanel";
import FinancePanel from "@/components/admin/cc/panels/FinancePanel";
import ServicesPanel from "@/components/admin/cc/panels/ServicesPanel";
import ActivityPanel from "@/components/admin/cc/panels/ActivityPanel";
import AlertsPanel from "@/components/admin/cc/panels/AlertsPanel";
import HealthPanel from "@/components/admin/cc/panels/HealthPanel";

export const dynamic = "force-dynamic";

/**
 * The Business Command Center.
 *
 * Reading order, top to bottom, is the order the questions get asked:
 *   how is the business doing → what does AI see → what needs me today →
 *   what is sales and delivery doing → what is marketing and money doing →
 *   what happened, what is wrong, what is running.
 *
 * Every panel below loads its own data inside its own Suspense boundary. The
 * page shell and the KPI row paint immediately; a slow panel delays itself and
 * nothing else, and a failing panel renders an error in its own frame rather
 * than taking the dashboard with it.
 *
 * The `cc-mN` class on each panel is its position on a phone. Mobile is not
 * this layout narrowed — it is a different running order, and it is defined
 * once in globals.css.
 */
export default async function CommandCenterPage({
  searchParams,
}: {
  searchParams: Promise<{ ask?: string }>;
}) {
  const [session, params] = await Promise.all([getAdminUser(), searchParams]);

  const firstName =
    session?.admin.full_name?.trim().split(/\s+/)[0] ??
    session?.admin.email.split("@")[0] ??
    "there";

  const ask = typeof params.ask === "string" ? params.ask.slice(0, 500) : undefined;

  return (
    <>
      <div className="cc-greet">
        <div>
          <h1>
            {greeting()}, {firstName}
          </h1>
          <p>Here&rsquo;s what&rsquo;s happening across Tomorrows Tech AI.</p>
        </div>
        <div className="cc-greet-meta">
          <span className="cc-dot s-operational" />
          {todayLabel()}
        </div>
      </div>

      <Suspense fallback={<KpiRowSkeleton />}>
        <KpiRow />
      </Suspense>

      <div className="cc-board">
        <Suspense fallback={<PanelSkeleton title="AI Business Advisor" rows={5} />}>
          <AdvisorPanel initialQuestion={ask} className="cc-s7 cc-m1" />
        </Suspense>

        <Suspense fallback={<PanelSkeleton title="AI insights" rows={4} />}>
          <InsightsPanel className="cc-s5 cc-m8" />
        </Suspense>

        <Suspense fallback={<PanelSkeleton title="Sales pipeline" rows={6} />}>
          <PipelinePanel className="cc-s7 cc-m3" />
        </Suspense>

        <Suspense fallback={<PanelSkeleton title="Today" rows={6} />}>
          <TodayPanel className="cc-s5 cc-m2" />
        </Suspense>

        <Suspense fallback={<PanelSkeleton title="Active projects" rows={5} />}>
          <ProjectsPanel className="cc-s12 cc-m4" />
        </Suspense>

        <Suspense fallback={<PanelSkeleton title="Financial snapshot" rows={5} />}>
          <FinancePanel className="cc-s5 cc-m6" />
        </Suspense>

        <Suspense fallback={<PanelSkeleton title="Website performance" rows={4} />}>
          <WebPanel className="cc-s7 cc-m9" />
        </Suspense>

        <Suspense fallback={<PanelSkeleton title="Marketing performance" rows={5} />}>
          <MarketingPanel className="cc-s7 cc-m10" />
        </Suspense>

        <Suspense fallback={<PanelSkeleton title="Social command center" rows={4} />}>
          <SocialPanel className="cc-s5 cc-m7" />
        </Suspense>

        <Suspense fallback={<PanelSkeleton title="Products & services" rows={4} />}>
          <ServicesPanel className="cc-s12 cc-m11" />
        </Suspense>

        <Suspense fallback={<PanelSkeleton title="Alerts" rows={4} />}>
          <AlertsPanel className="cc-s4 cc-m5" />
        </Suspense>

        <Suspense fallback={<PanelSkeleton title="Recent activity" rows={5} />}>
          <ActivityPanel className="cc-s4 cc-m12" />
        </Suspense>

        <Suspense fallback={<PanelSkeleton title="System status" rows={5} />}>
          <HealthPanel className="cc-s4 cc-m13" />
        </Suspense>
      </div>
    </>
  );
}
