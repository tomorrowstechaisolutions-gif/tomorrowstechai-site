import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import { loadSoftwareChoices, loadSoftwareDetail, type SoftwareDetail } from "@/lib/software/detail";
import { setSoftwareStatusAction, updateSoftwareAction } from "@/app/admin/software-actions";
import {
  BILLING_MODEL_LABELS,
  BILLING_MODEL_ORDER,
  CHANNEL_LABELS,
  CHANNEL_ORDER,
  CLIENT_STATUS_TONE,
  FEATURE_CATEGORY_LABELS,
  FEATURE_STATUS_TONE,
  HEALTH_TONE,
  INCLUSION_LABELS,
  LIFECYCLE_LABELS,
  LIFECYCLE_ORDER,
  LIFECYCLE_TONE,
  ONBOARDING_LABELS,
  ONBOARDING_TONE,
  PLAN_STATUS_LABELS,
  PLAN_STATUS_TONE,
  PRODUCT_TYPE_LABELS,
  PRODUCT_TYPE_ORDER,
  VERSION_STATUS_LABELS,
  VERSION_STATUS_TONE,
  limitLabel,
  versionSortKey,
} from "@/lib/software/types";
import { EmptyState, Panel } from "@/components/admin/cc/Panel";
import { ago, count, DASH, money, shortDate } from "@/components/admin/cc/format";
import {
  AddClientSheet,
  CancelClientButton,
  ChangePlanSheet,
  DeprecateVersion,
  LinkAppForm,
  MatrixCell,
  PlanSheet,
  PromoteVersion,
  RetirePlanButton,
  UnlinkAppButton,
  VersionSheet,
} from "@/components/admin/cc/software/SoftwareForms";
import { IconAlert, IconArrowRight, IconCode, IconDollar, IconLayers, IconUsers } from "@/components/admin/cc/Icons";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "plans", label: "Plans & Pricing" },
  { key: "clients", label: "Clients" },
  { key: "versions", label: "Versions" },
  { key: "releases", label: "Releases" },
  { key: "apps", label: "Apps" },
  { key: "infrastructure", label: "Infrastructure" },
  { key: "features", label: "Features" },
  { key: "roadmap", label: "Roadmap" },
  { key: "issues", label: "Issues" },
  { key: "revenue", label: "Revenue" },
  { key: "activity", label: "Activity" },
  { key: "settings", label: "Settings" },
] as const;

/** Tabs whose screens exist. The rest render an honest placeholder. */
const BUILT = new Set(["overview", "plans", "clients", "versions", "apps", "activity", "settings"]);

const NOT_BUILT: Record<string, { blurb: string; nearest?: { href: string; label: string } }> = {
  releases: {
    blurb:
      "Release planning and the release checklist: target dates, owners, blocked reasons, and the features and issues each release carries. The versions a release produces are already tracked on the Versions tab.",
  },
  infrastructure: {
    blurb:
      "Hosting, database, repository, domains and SSL for this product — read across the apps it is built from, never duplicated here, and never showing a secret. What is connected today is on each app's own screen.",
    nearest: { href: "/admin/apps", label: "Open Apps" },
  },
  features: {
    blurb:
      "The full feature register with categories, owners and the version each shipped in. The plan comparison matrix that uses it is already live on Plans & Pricing.",
  },
  roadmap: {
    blurb:
      "Board, timeline and table views of what is planned, with priority, effort, business value and how many clients asked for each item.",
  },
  issues: {
    blurb:
      "Bugs, technical debt and client requests against this product. These are Tasks — there is no second issue tracker — so they can already be seen and filtered on the Tasks screen.",
    nearest: { href: "/admin/tasks", label: "Open Tasks" },
  },
  revenue: {
    blurb:
      "MRR and ARR over time, revenue by plan and by client, and the subscriptions, invoices and payments behind them, read from the billing system rather than recalculated.",
    nearest: { href: "/admin/invoices", label: "Open Invoices" },
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("software_products").select("name").eq("id", id).maybeSingle();
  return { title: data?.name ? `${data.name} — Software` : "Software" };
}

export default async function SoftwareDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const raw = Array.isArray(query.tab) ? query.tab[0] : query.tab;
  const tab = TABS.some((t) => t.key === raw) ? (raw as string) : "overview";

  const session = await getAdminUser();
  const canManage = ["owner", "admin"].includes(session?.admin.role ?? "viewer");

  const supabase = await createSupabaseServerClient();
  const [product, choices] = await Promise.all([
    loadSoftwareDetail(supabase, id),
    loadSoftwareChoices(supabase),
  ]);

  if (!product) notFound();

  const planChoices = product.plans
    .filter((p) => p.status === "active" || p.status === "draft")
    .map((p) => ({ id: p.id, name: p.name, monthlyPriceCents: p.monthlyPriceCents }));

  return (
    <>
      <div className="cc-greet">
        <div>
          <h1>{product.name}</h1>
          <div className="cc-taglist" style={{ marginTop: 6, marginBottom: 6 }}>
            <span className={`cc-chip ${LIFECYCLE_TONE[product.status]}`}>{product.statusLabel}</span>
            <span
              className={`cc-chip ${HEALTH_TONE[product.health.state]}`}
              title={product.health.reasons.map((r) => r.label).join(" · ") || undefined}
            >
              {product.health.label}
            </span>
            <span className="cc-chip t-muted">{product.productTypeLabel}</span>
          </div>
          <p>
            {product.description || "No description recorded."}
            {product.industry ? ` · ${product.industry}` : ""}
          </p>
        </div>
        <div className="cc-greet-actions">
          <Link className="cc-btn" href="/admin/software">All software</Link>
          {canManage ? <VersionSheet softwareId={product.id} /> : null}
        </div>
      </div>

      <DetailKpis product={product} />

      <div className="cc-tabs">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "overview" ? `/admin/software/${product.id}` : `/admin/software/${product.id}?tab=${t.key}`}
            className={`cc-tab ${tab === t.key ? "is-on" : ""}`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <div className="cc-board">
        {tab === "overview" ? <Overview product={product} /> : null}
        {tab === "plans" ? <Plans product={product} canManage={canManage} /> : null}
        {tab === "clients" ? (
          <Clients product={product} canManage={canManage} choices={choices} planChoices={planChoices} />
        ) : null}
        {tab === "versions" ? <Versions product={product} canManage={canManage} /> : null}
        {tab === "apps" ? <Apps product={product} canManage={canManage} choices={choices} /> : null}
        {tab === "activity" ? <Activity product={product} /> : null}
        {tab === "settings" ? <Settings product={product} canManage={canManage} choices={choices} /> : null}
        {!BUILT.has(tab) ? <NotBuilt tab={tab} /> : null}
      </div>
    </>
  );
}

/* ── KPIs ──────────────────────────────────────────────────────────── */

function DetailKpis({ product }: { product: SoftwareDetail }) {
  const k = product.kpis;
  const cards = [
    { label: "Active Clients", value: count(k.activeClients), foot: `${count(product.clients.length)} total assignments` },
    { label: "MRR", value: k.mrrCents === null ? DASH : money(k.mrrCents), foot: "From agreed prices" },
    { label: "Current Version", value: k.currentVersion ?? DASH, foot: k.stagingVersion ? `${k.stagingVersion} in staging` : "Nothing in staging" },
    {
      label: "Open Issues",
      value: count(k.openIssues),
      foot: k.criticalIssues > 0 ? `${count(k.criticalIssues)} critical` : "None critical",
    },
    {
      label: "Next Release",
      value: k.nextRelease ? k.nextRelease.name : DASH,
      foot: k.nextRelease?.targetDate ? shortDate(k.nextRelease.targetDate) : "Nothing scheduled",
    },
    {
      label: "Lifetime Revenue",
      value: k.lifetimeRevenueCents === null ? DASH : money(k.lifetimeRevenueCents),
      // Collected, not billed, and not the same as the sum of the prices.
      foot: k.lifetimeRevenueCents === null ? "No invoice attributed yet" : "Collected on attributed invoices",
    },
  ];

  return (
    <div className="cc-kpis">
      {cards.map((card) => (
        <div className="cc-kpi" key={card.label}>
          <div className="cc-kpi-top">
            <span className="cc-kpi-label">{card.label}</span>
          </div>
          <div className="cc-kpi-value">{card.value}</div>
          <div className="cc-kpi-foot"><span className="cc-faint">{card.foot}</span></div>
        </div>
      ))}
    </div>
  );
}

/* ── Overview ──────────────────────────────────────────────────────── */

function Overview({ product }: { product: SoftwareDetail }) {
  const problems = product.health.reasons.filter((r) => r.severity !== "info");

  return (
    <>
      <Panel title="Product information" icon={<IconCode size={15} />} className="cc-s6">
        <dl className="cc-kv">
          <dt>Name</dt><dd>{product.name}</dd>
          {product.internalName ? (<><dt>Internal name</dt><dd>{product.internalName}</dd></>) : null}
          <dt>Type</dt><dd>{product.productTypeLabel}</dd>
          <dt>Industry</dt><dd>{product.industry ?? DASH}</dd>
          <dt>Owner</dt><dd>{product.owner ?? DASH}</dd>
          <dt>Technical owner</dt><dd>{product.technicalOwner ?? DASH}</dd>
          <dt>Sales owner</dt><dd>{product.salesOwner ?? DASH}</dd>
          <dt>Lifecycle</dt><dd>{product.statusLabel}</dd>
          <dt>Health</dt><dd>{product.health.label}</dd>
          <dt>Launch date</dt><dd>{product.launchDate ? shortDate(product.launchDate) : DASH}</dd>
          <dt>Created</dt><dd>{shortDate(product.createdAt)}</dd>
          <dt>Last updated</dt><dd>{ago(product.updatedAt)}</dd>
        </dl>
      </Panel>

      <Panel title="Operational summary" icon={<IconLayers size={15} />} className="cc-s6">
        <dl className="cc-kv">
          <dt>Production version</dt><dd>{product.kpis.currentVersion ?? DASH}</dd>
          <dt>Staging version</dt><dd>{product.kpis.stagingVersion ?? DASH}</dd>
          <dt>Linked apps</dt><dd>{product.apps.length > 0 ? count(product.apps.length) : DASH}</dd>
          <dt>Active clients</dt><dd>{count(product.kpis.activeClients)}</dd>
          <dt>Plans</dt><dd>{product.plans.length > 0 ? count(product.plans.length) : DASH}</dd>
          <dt>MRR</dt><dd>{product.kpis.mrrCents === null ? DASH : money(product.kpis.mrrCents)}</dd>
          <dt>Setup revenue agreed</dt>
          <dd>{product.kpis.setupRevenueCents === null ? DASH : money(product.kpis.setupRevenueCents)}</dd>
          <dt>Open critical issues</dt><dd>{count(product.kpis.criticalIssues)}</dd>
          <dt>Next planned release</dt>
          <dd>
            {product.kpis.nextRelease
              ? `${product.kpis.nextRelease.name}${product.kpis.nextRelease.targetDate ? ` · ${shortDate(product.kpis.nextRelease.targetDate)}` : ""}`
              : DASH}
          </dd>
        </dl>
      </Panel>

      <Panel title="Needs attention" icon={<IconAlert size={15} />} className="cc-s6" bodyClass={problems.length ? "flush" : ""}>
        {problems.length === 0 ? (
          <EmptyState
            title="Nothing needs attention"
            text="No blocked release, failed payment, overdue onboarding, critical issue or failing app."
          />
        ) : (
          <div className="cc-alerts">
            {problems.map((reason, index) => (
              <Link
                key={index}
                href={`/admin/software/${product.id}${reason.tab ? `?tab=${reason.tab}` : ""}`}
                className={`cc-alert p-${reason.severity === "critical" ? "critical" : "medium"}`}
              >
                <span className="cc-alert-pri" />
                <span className="cc-alert-main">
                  <span className="cc-alert-title">{reason.label}</span>
                  <span className="cc-alert-detail">{reason.detail}</span>
                </span>
                <span className="cc-alert-cat">{reason.severity}</span>
              </Link>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Recent activity" className="cc-s6">
        {product.recentActivity.length === 0 ? (
          <EmptyState title="Nothing recorded yet" text="Changes to this product, its plans, versions and clients are logged here." />
        ) : (
          <ul className="cc-feed">
            {product.recentActivity.slice(0, 6).map((event) => (
              <li className="cc-feed-item" key={event.id}>
                <span className="cc-feed-main">
                  <span className="cc-feed-title">{event.body}</span>
                  <span className="cc-feed-sub">{event.actor ?? "system"}</span>
                </span>
                <span className="cc-feed-when">{ago(event.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

/* ── Plans & Pricing ───────────────────────────────────────────────── */

function Plans({ product, canManage }: { product: SoftwareDetail; canManage: boolean }) {
  const liveePlans = product.plans;

  return (
    <>
      <Panel
        title="Plans & Pricing"
        sub={`${count(product.plans.length)} ${product.plans.length === 1 ? "plan" : "plans"}`}
        icon={<IconDollar size={15} />}
        className="cc-s12"
      >
        {canManage ? (
          <div className="cc-rowacts" style={{ marginBottom: 12 }}>
            <PlanSheet softwareId={product.id} />
          </div>
        ) : null}

        {product.plans.length === 0 ? (
          <EmptyState
            title="No plans yet"
            text="Add a plan to describe what this product costs, what it includes, and what its usage limits are."
          />
        ) : (
          <div className="cc-scroll">
            <table className="cc-table dense">
              <thead>
                <tr>
                  <th>Plan</th>
                  <th className="num">Monthly</th>
                  <th className="num">Annual</th>
                  <th className="num">Setup</th>
                  <th>Trial</th>
                  <th>Status</th>
                  <th className="num">Clients</th>
                  <th className="num">Actual MRR</th>
                  {canManage ? <th>Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {liveePlans.map((plan) => (
                  <tr key={plan.id}>
                    <td>
                      <span className="cc-strong">{plan.name}</span>
                      {plan.isDefault ? <span className="cc-chip t-info" style={{ marginLeft: 6 }}>Default</span> : null}
                      <span className="cc-client-sub">{plan.description || `${plan.limits.length} limits`}</span>
                    </td>
                    <td className="num">{money(plan.monthlyPriceCents)}</td>
                    <td className="num">{money(plan.annualPriceCents)}</td>
                    <td className="num">{money(plan.setupFeeCents)}</td>
                    <td className="cc-dim">{plan.trialDays ? `${plan.trialDays} days` : DASH}</td>
                    <td><span className={`cc-chip ${PLAN_STATUS_TONE[plan.status]}`}>{PLAN_STATUS_LABELS[plan.status]}</span></td>
                    <td className="num">{plan.clientCount > 0 ? count(plan.clientCount) : <span className="cc-faint">{DASH}</span>}</td>
                    <td className="num" title="What clients on this plan actually pay, which can differ from the list price above.">
                      {plan.actualMrrCents === null ? <span className="cc-faint">{DASH}</span> : money(plan.actualMrrCents)}
                    </td>
                    {canManage ? (
                      <td>
                        <span className="cc-rowacts">
                          <PlanSheet
                            softwareId={product.id}
                            plan={{
                              id: plan.id,
                              name: plan.name,
                              description: plan.description,
                              monthlyPriceCents: plan.monthlyPriceCents,
                              annualPriceCents: plan.annualPriceCents,
                              setupFeeCents: plan.setupFeeCents,
                              trialDays: plan.trialDays,
                              status: plan.status,
                              isDefault: plan.isDefault,
                              displayOrder: plan.displayOrder,
                            }}
                          />
                          {plan.status !== "retired" ? (
                            <RetirePlanButton softwareId={product.id} planId={plan.id} planName={plan.name} />
                          ) : null}
                        </span>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {product.plans.some((p) => p.actualMrrCents !== null && p.monthlyPriceCents !== null) ? (
          <p className="cc-note">
            &ldquo;Actual MRR&rdquo; is what clients on the plan agreed to pay. Where it does not
            match the list price times the client count, somebody was given a different
            number — which is a real fact about the business, not an error.
          </p>
        ) : null}
      </Panel>

      <FeatureMatrix product={product} canManage={canManage} />

      <Panel title="Usage limits" className="cc-s12">
        {product.plans.length === 0 ? (
          <EmptyState title="No plans yet" text="Limits belong to a plan, so add a plan first." />
        ) : product.plans.every((p) => p.limits.length === 0) ? (
          <EmptyState
            title="No usage limits recorded"
            text="Limits are rows rather than fixed columns, so this product can limit whatever it actually limits — technicians, locations, vehicles, seats, AI credits."
          />
        ) : (
          <div className="cc-scroll">
            <table className="cc-table dense">
              <thead>
                <tr>
                  <th>Limit</th>
                  {product.plans.map((plan) => (
                    <th key={plan.id} className="num">{plan.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...new Map(
                  product.plans.flatMap((p) => p.limits).map((l) => [l.key, l] as const)
                ).values()]
                  .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
                  .map((limit) => (
                    <tr key={limit.key}>
                      <td className="cc-strong">{limit.label}</td>
                      {product.plans.map((plan) => {
                        const own = plan.limits.find((l) => l.key === limit.key);
                        return (
                          <td key={plan.id} className="num cc-dim">
                            {own ? limitLabel(own.limitType, own.value, own.unit) : DASH}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

function FeatureMatrix({ product, canManage }: { product: SoftwareDetail; canManage: boolean }) {
  return (
    <Panel
      title="Feature matrix"
      sub={product.features.length > 0 ? `${count(product.features.length)} features` : undefined}
      className="cc-s12"
    >
      {product.features.length === 0 || product.plans.length === 0 ? (
        <EmptyState
          title="Nothing to compare yet"
          text="Add plans and features to this product and the comparison grid builds itself. A feature is never included in a plan until it is put there, so nothing is granted by accident."
        />
      ) : (
        <>
          <div className="cc-scroll">
            <table className="cc-table dense">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Category</th>
                  {product.plans.map((plan) => (
                    <th key={plan.id}>{plan.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {product.features.map((feature) => (
                  <tr key={feature.id}>
                    <td>
                      <span className="cc-strong">{feature.name}</span>
                      <span className="cc-client-sub">
                        <span className={`cc-chip ${FEATURE_STATUS_TONE[feature.status]}`}>{feature.status}</span>
                      </span>
                    </td>
                    <td className="cc-dim">{FEATURE_CATEGORY_LABELS[feature.category]}</td>
                    {product.plans.map((plan) => {
                      const entry = feature.byPlan[plan.id];
                      // No row means NOT INCLUDED. That is the whole rule.
                      const inclusion = entry?.inclusion ?? "not_included";
                      return (
                        <td key={plan.id}>
                          {canManage ? (
                            <MatrixCell
                              softwareId={product.id}
                              planId={plan.id}
                              featureId={feature.id}
                              inclusion={inclusion}
                              note={entry?.note ?? null}
                              canManage={canManage}
                            />
                          ) : (
                            <span
                              className={`cc-chip ${inclusion === "included" ? "t-ok" : inclusion === "limited" ? "t-warn" : "t-muted"}`}
                              title={entry?.note ?? undefined}
                            >
                              {INCLUSION_LABELS[inclusion]}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="cc-note">
            A feature with no entry against a plan is <strong>not included</strong> in it.
            Adding a feature never silently grants it to every plan.
          </p>
        </>
      )}
    </Panel>
  );
}

/* ── Clients ───────────────────────────────────────────────────────── */

function Clients({
  product,
  canManage,
  choices,
  planChoices,
}: {
  product: SoftwareDetail;
  canManage: boolean;
  choices: Awaited<ReturnType<typeof loadSoftwareChoices>>;
  planChoices: { id: string; name: string; monthlyPriceCents: number | null }[];
}) {
  const assigned = new Set(product.clients.map((c) => c.customerId));
  const available = choices.clients.filter((c) => !assigned.has(c.id));

  return (
    <Panel
      title="Clients"
      sub={`${count(product.clients.length)} ${product.clients.length === 1 ? "assignment" : "assignments"}`}
      icon={<IconUsers size={15} />}
      className="cc-s12"
    >
      {canManage ? (
        <div className="cc-rowacts" style={{ marginBottom: 12 }}>
          <AddClientSheet
            softwareId={product.id}
            clients={available}
            plans={planChoices}
            versions={product.versions.map((v) => ({ id: v.id, version: v.version }))}
            projects={choices.projects}
          />
        </div>
      ) : null}

      {product.clients.length === 0 ? (
        <EmptyState
          title="No clients subscribed yet"
          text="Put a client on this product to record their plan, the price they agreed to, their onboarding and the version they run."
        />
      ) : (
        <div className="cc-scroll">
          <table className="cc-table dense">
            <thead>
              <tr>
                <th>Client</th>
                <th>Plan</th>
                <th>Status</th>
                <th className="num">Monthly</th>
                <th className="num">Setup</th>
                <th>Onboarding</th>
                <th>Version</th>
                <th>Start</th>
                <th className="num">Lifetime</th>
                {canManage ? <th>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {product.clients.map((client) => (
                <tr key={client.id}>
                  <td>
                    <Link className="cc-link cc-strong" href={`/admin/clients/${client.customerId}`}>
                      {client.name}
                    </Link>
                    {client.jobId ? (
                      <span className="cc-client-sub">
                        <Link className="cc-link" href={`/admin/jobs/${client.jobId}`}>Implementation project</Link>
                      </span>
                    ) : null}
                  </td>
                  <td className="cc-dim">{client.planName ?? DASH}</td>
                  <td><span className={`cc-chip ${CLIENT_STATUS_TONE[client.status]}`}>{client.status}</span></td>
                  <td className="num">{money(client.monthlyPriceCents)}</td>
                  <td className="num">{money(client.setupFeeCents)}</td>
                  <td>
                    <span className={`cc-chip ${ONBOARDING_TONE[client.onboardingStatus]}`}>
                      {ONBOARDING_LABELS[client.onboardingStatus]}
                    </span>
                    {client.onboardingOverdue ? (
                      <span className="cc-client-sub cc-delta down">
                        Due {shortDate(client.onboardingDueAt)}
                      </span>
                    ) : null}
                  </td>
                  <td className="cc-mono cc-dim">{client.version ?? DASH}</td>
                  <td className="cc-dim">{shortDate(client.startDate)}</td>
                  <td className="num">
                    {client.lifetimeRevenueCents === null
                      ? <span className="cc-faint" title="No invoice attributed to this product for this client.">{DASH}</span>
                      : money(client.lifetimeRevenueCents)}
                  </td>
                  {canManage ? (
                    <td>
                      <span className="cc-rowacts">
                        {client.status !== "canceled" && planChoices.length > 0 ? (
                          <ChangePlanSheet
                            softwareId={product.id}
                            assignmentId={client.id}
                            clientName={client.name}
                            currentMonthlyCents={client.monthlyPriceCents}
                            plans={planChoices}
                          />
                        ) : null}
                        {client.status !== "canceled" ? (
                          <CancelClientButton
                            softwareId={product.id}
                            assignmentId={client.id}
                            clientName={client.name}
                          />
                        ) : null}
                      </span>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="cc-note">
        The price on each row is what that client agreed to when they were added. It does
        not move when a plan&rsquo;s price changes — only an explicit plan change rewrites it,
        and that is recorded in the activity log with both figures.
      </p>
    </Panel>
  );
}

/* ── Versions ──────────────────────────────────────────────────────── */

function Versions({ product, canManage }: { product: SoftwareDetail; canManage: boolean }) {
  const live = product.versions.find((v) => v.isCurrentProduction) ?? null;

  return (
    <Panel
      title="Versions"
      sub={`${count(product.versions.length)} recorded`}
      icon={<IconLayers size={15} />}
      className="cc-s12"
    >
      {canManage ? (
        <div className="cc-rowacts" style={{ marginBottom: 12 }}>
          <VersionSheet softwareId={product.id} />
        </div>
      ) : null}

      {product.versions.length === 0 ? (
        <EmptyState
          title="No versions recorded yet"
          text="Record a version to track what shipped, when, and what changed. Promoting one to production automatically stands the previous one down."
        />
      ) : (
        <div className="cc-scroll">
          <table className="cc-table dense">
            <thead>
              <tr>
                <th>Version</th>
                <th>Status</th>
                <th>Channel</th>
                <th>Released</th>
                <th className="num">Clients</th>
                <th>Notes</th>
                {canManage ? <th>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {product.versions.map((version) => {
                const isRollback = Boolean(
                  live &&
                  !version.isCurrentProduction &&
                  versionSortKey(version.version).localeCompare(versionSortKey(live.version)) < 0
                );
                return (
                  <tr key={version.id}>
                    <td>
                      <span className="cc-mono cc-strong">{version.version}</span>
                      <span className="cc-client-sub">
                        {version.isCurrentProduction ? "Live in production" : null}
                        {version.isCurrentStaging ? "In staging" : null}
                        {version.isBreaking ? " · breaking change" : null}
                      </span>
                    </td>
                    <td><span className={`cc-chip ${VERSION_STATUS_TONE[version.status]}`}>{VERSION_STATUS_LABELS[version.status]}</span></td>
                    <td className="cc-dim">{CHANNEL_LABELS[version.channel]}</td>
                    <td className="cc-dim">{version.releasedAt ? shortDate(version.releasedAt) : DASH}</td>
                    <td className="num">{version.clientCount > 0 ? count(version.clientCount) : <span className="cc-faint">{DASH}</span>}</td>
                    <td className="cc-dim" style={{ maxWidth: 320 }}>{version.releaseNotes || DASH}</td>
                    {canManage ? (
                      <td>
                        <span className="cc-rowacts">
                          {!version.isCurrentProduction ? (
                            <PromoteVersion
                              softwareId={product.id}
                              versionId={version.id}
                              version={version.version}
                              target="production"
                              isRollback={isRollback}
                              liveVersion={live?.version ?? null}
                            />
                          ) : null}
                          {!version.isCurrentStaging && !version.isCurrentProduction ? (
                            <PromoteVersion
                              softwareId={product.id}
                              versionId={version.id}
                              version={version.version}
                              target="staging"
                              isRollback={false}
                              liveVersion={null}
                            />
                          ) : null}
                          {version.status !== "deprecated" && !version.isCurrentProduction ? (
                            <DeprecateVersion softwareId={product.id} versionId={version.id} />
                          ) : null}
                        </span>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/* ── Apps ──────────────────────────────────────────────────────────── */

function Apps({
  product,
  canManage,
  choices,
}: {
  product: SoftwareDetail;
  canManage: boolean;
  choices: Awaited<ReturnType<typeof loadSoftwareChoices>>;
}) {
  return (
    <Panel
      title="Apps"
      sub={`${count(product.apps.length)} linked`}
      icon={<IconLayers size={15} />}
      className="cc-s12"
    >
      {canManage ? (
        <div style={{ marginBottom: 12 }}>
          <LinkAppForm softwareId={product.id} unlinkedApps={choices.unlinkedApps} />
        </div>
      ) : null}

      {product.apps.length === 0 ? (
        <EmptyState
          title="No apps linked yet"
          text="A software product is made of applications — a web platform, an admin center, a technician app, a customer portal. Link them and their health rolls up to this product."
          cta={{ href: "/admin/apps", label: "Open Apps" }}
        />
      ) : (
        <>
          <div className="cc-scroll">
            <table className="cc-table dense">
              <thead>
                <tr>
                  <th>App</th>
                  <th>Platform</th>
                  <th>Status</th>
                  <th>Health</th>
                  <th>Version</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {product.apps.map((app) => (
                  <tr key={app.id}>
                    <td><Link className="cc-link cc-strong" href={`/admin/apps/${app.id}`}>{app.name}</Link></td>
                    <td className="cc-dim">{app.platformLabel}</td>
                    <td className="cc-dim">{app.statusLabel}</td>
                    <td><span className={`cc-chip ${HEALTH_TONE[app.health]}`}>{app.healthLabel}</span></td>
                    <td className="cc-mono cc-dim">{app.currentVersion ?? DASH}</td>
                    <td>
                      <span className="cc-rowacts">
                        <Link className="cc-btn is-sm" href={`/admin/apps/${app.id}`}>Open</Link>
                        {canManage ? <UnlinkAppButton softwareId={product.id} appId={app.id} /> : null}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="cc-note">
            Apps stay managed on the Apps screen — this is a linked view, not a second
            copy. Deployments, environments, domains and health checks all live there.
          </p>
        </>
      )}
    </Panel>
  );
}

/* ── Activity ──────────────────────────────────────────────────────── */

function Activity({ product }: { product: SoftwareDetail }) {
  return (
    <Panel title="Activity" className="cc-s12">
      {product.recentActivity.length === 0 ? (
        <EmptyState
          title="Nothing recorded yet"
          text="Product changes, plan and price changes, client additions, version promotions and release events are all logged here."
        />
      ) : (
        <ul className="cc-feed">
          {product.recentActivity.map((event) => (
            <li className="cc-feed-item" key={event.id}>
              <span className="cc-feed-main">
                <span className="cc-feed-title">{event.body}</span>
                <span className="cc-feed-sub">{event.kind.replace(/_/g, " ")} · {event.actor ?? "system"}</span>
              </span>
              <span className="cc-feed-when">{ago(event.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ── Settings ──────────────────────────────────────────────────────── */

function Settings({
  product,
  canManage,
  choices,
}: {
  product: SoftwareDetail;
  canManage: boolean;
  choices: Awaited<ReturnType<typeof loadSoftwareChoices>>;
}) {
  if (!canManage) {
    return (
      <Panel title="Settings" className="cc-s12">
        <EmptyState title="Read only" text="Changing a product is limited to owners and admins." />
      </Panel>
    );
  }

  return (
    <Panel title="Settings" className="cc-s12">
      {/* Lifecycle is its own form and its own action. Moving a product to
          Deprecated is a different kind of decision from correcting its
          description, and burying it inside a long Save button is how it
          gets changed by accident. */}
      <p className="cc-subhead" style={{ marginTop: 0 }}>Lifecycle status</p>
      <form action={setSoftwareStatusAction} className="cc-rowacts" style={{ marginBottom: 4 }}>
        <input type="hidden" name="software_id" value={product.id} />
        <select name="status" className="cc-filter-select" defaultValue={product.status}>
          {LIFECYCLE_ORDER.filter((key) => key !== "archived").map((key) => (
            <option key={key} value={key}>{LIFECYCLE_LABELS[key]}</option>
          ))}
        </select>
        <button type="submit" className="cc-btn is-sm">Set status</button>
      </form>
      <p className="cc-note" style={{ marginTop: 0 }}>
        Archiving is not in this list — it is on the row menu, and it refuses while
        clients are still live on the product.
      </p>

      <form action={updateSoftwareAction}>
        <input type="hidden" name="software_id" value={product.id} />

        <p className="cc-subhead">Identity</p>
        <div className="cc-field row2">
          <div className="cc-field">
            <label className="cc-label" htmlFor="set-name">Product name</label>
            <input id="set-name" name="name" className="cc-input" required defaultValue={product.name} />
          </div>
          <div className="cc-field">
            <label className="cc-label" htmlFor="set-slug">Slug</label>
            <input id="set-slug" name="slug" className="cc-input" defaultValue={product.slug} />
          </div>
        </div>

        <div className="cc-field">
          <label className="cc-label" htmlFor="set-desc">Description</label>
          <textarea id="set-desc" name="description" className="cc-textarea" rows={2} defaultValue={product.description ?? ""} />
        </div>

        <div className="cc-field row2">
          <div className="cc-field">
            <label className="cc-label" htmlFor="set-type">Product type</label>
            <select id="set-type" name="product_type" className="cc-select" defaultValue={product.productType}>
              {PRODUCT_TYPE_ORDER.map((key) => (
                <option key={key} value={key}>{PRODUCT_TYPE_LABELS[key]}</option>
              ))}
            </select>
          </div>
          <div className="cc-field">
            <label className="cc-label" htmlFor="set-industry">Industry</label>
            <input id="set-industry" name="industry" className="cc-input" defaultValue={product.industry ?? ""} />
          </div>
        </div>

        <p className="cc-subhead">People</p>
        <div className="cc-field row2">
          <div className="cc-field">
            <label className="cc-label" htmlFor="set-owner">Owner</label>
            <input id="set-owner" name="owner" className="cc-input" list="set-people" defaultValue={product.owner ?? ""} />
          </div>
          <div className="cc-field">
            <label className="cc-label" htmlFor="set-tech">Technical owner</label>
            <input id="set-tech" name="technical_owner" className="cc-input" list="set-people" defaultValue={product.technicalOwner ?? ""} />
          </div>
        </div>
        <div className="cc-field">
          <label className="cc-label" htmlFor="set-sales">Sales owner</label>
          <input id="set-sales" name="sales_owner" className="cc-input" list="set-people" defaultValue={product.salesOwner ?? ""} />
        </div>
        <datalist id="set-people">
          {choices.people.map((person) => (
            <option key={person} value={person} />
          ))}
        </datalist>

        <p className="cc-subhead">Commercial defaults</p>
        <div className="cc-field row2">
          <div className="cc-field">
            <label className="cc-label" htmlFor="set-billing">Billing model</label>
            <select id="set-billing" name="billing_model" className="cc-select" defaultValue={product.billingModel}>
              {BILLING_MODEL_ORDER.map((key) => (
                <option key={key} value={key}>{BILLING_MODEL_LABELS[key]}</option>
              ))}
            </select>
          </div>
          <div className="cc-field">
            <label className="cc-label" htmlFor="set-channel">Release channel</label>
            <select id="set-channel" name="release_channel" className="cc-select" defaultValue={product.releaseChannel}>
              {CHANNEL_ORDER.map((key) => (
                <option key={key} value={key}>{CHANNEL_LABELS[key]}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="cc-field row2">
          <div className="cc-field">
            <label className="cc-label" htmlFor="set-monthly">Default monthly price ($)</label>
            <input
              id="set-monthly"
              name="default_monthly_price"
              className="cc-input"
              inputMode="decimal"
              defaultValue={product.defaultMonthlyPriceCents === null ? "" : product.defaultMonthlyPriceCents / 100}
            />
          </div>
          <div className="cc-field">
            <label className="cc-label" htmlFor="set-setup">Setup fee ($)</label>
            <input
              id="set-setup"
              name="setup_fee"
              className="cc-input"
              inputMode="decimal"
              defaultValue={product.setupFeeCents === null ? "" : product.setupFeeCents / 100}
            />
          </div>
        </div>

        <div className="cc-field row2">
          <div className="cc-field">
            <label className="cc-label" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" name="trial_available" defaultChecked={product.trialAvailable} />
              <span>Offer a free trial</span>
            </label>
          </div>
          <div className="cc-field">
            <label className="cc-label" htmlFor="set-trial">Trial length (days)</label>
            <input id="set-trial" name="trial_days" className="cc-input" inputMode="numeric" defaultValue={product.trialDays ?? ""} />
          </div>
        </div>

        <p className="cc-subhead">Relationships</p>
        <div className="cc-field row2">
          <div className="cc-field">
            <label className="cc-label" htmlFor="set-service">Default service</label>
            <select id="set-service" name="default_service_id" className="cc-select" defaultValue={product.defaultServiceId ?? ""}>
              <option value="">None</option>
              {choices.services.map((service) => (
                <option key={service.id} value={service.id}>{service.name}</option>
              ))}
            </select>
          </div>
          <div className="cc-field">
            <label className="cc-label" htmlFor="set-template">Default project template</label>
            <select id="set-template" name="default_task_template_id" className="cc-select" defaultValue={product.defaultTaskTemplateId ?? ""}>
              <option value="">None</option>
              {choices.taskTemplates.map((template) => (
                <option key={template.id} value={template.id}>{template.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="cc-field row2">
          <div className="cc-field">
            <label className="cc-label" htmlFor="set-website">Marketing website</label>
            <select id="set-website" name="website_id" className="cc-select" defaultValue={product.websiteId ?? ""}>
              <option value="">None</option>
              {choices.websites.map((website) => (
                <option key={website.id} value={website.id}>{website.name}</option>
              ))}
            </select>
          </div>
          <div className="cc-field">
            <label className="cc-label" htmlFor="set-launch">Launch date</label>
            <input id="set-launch" name="launch_date" className="cc-input" type="date" defaultValue={product.launchDate ?? ""} />
          </div>
        </div>

        <div className="cc-field">
          <label className="cc-label" htmlFor="set-notes">Internal notes</label>
          <textarea id="set-notes" name="notes" className="cc-textarea" rows={3} defaultValue={product.notes ?? ""} />
        </div>

        <div className="cc-sheet-foot">
          <button type="submit" className="cc-btn primary">Save changes</button>
        </div>
      </form>

      <p className="cc-note">
        Lifecycle status is changed from the product header, and archiving is on the row
        menu — it refuses while clients are still live on the product, because a product
        with paying clients is not finished with. Nothing here deletes a product: its
        versions, client assignments and invoices are history other screens still read.
      </p>
    </Panel>
  );
}

/* ── The tabs that are not built yet ───────────────────────────────── */

function NotBuilt({ tab }: { tab: string }) {
  const entry = NOT_BUILT[tab];
  const label = TABS.find((t) => t.key === tab)?.label ?? "This tab";

  return (
    <Panel title={label} className="cc-s12">
      <div className="cc-panel-body" style={{ padding: 0 }}>
        <span className="cc-chip t-muted">Not built yet</span>
        <p style={{ fontSize: "0.86rem", lineHeight: 1.65, color: "var(--cc-dim)", marginTop: 10 }}>
          {entry?.blurb ?? "This screen has a place in the system but has not been built yet."}
        </p>
        {entry?.nearest ? (
          <Link href={entry.nearest.href} className="cc-cta" style={{ marginTop: 12 }}>
            {entry.nearest.label} <IconArrowRight size={13} />
          </Link>
        ) : null}
      </div>
    </Panel>
  );
}
