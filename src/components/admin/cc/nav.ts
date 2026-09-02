import type { ComponentType, SVGProps } from "react";
import {
  IconBell,
  IconBot,
  IconBriefcase,
  IconCalendar,
  IconCart,
  IconChart,
  IconCheckSquare,
  IconCode,
  IconDollar,
  IconFile,
  IconFunnel,
  IconGlobe,
  IconGrid,
  IconImage,
  IconInbox,
  IconLayers,
  IconMail,
  IconMegaphone,
  IconPen,
  IconPulse,
  IconRepeat,
  IconServer,
  IconSettings,
  IconShare,
  IconSpark,
  IconUsers,
  IconZap,
} from "./Icons";

/**
 * The whole admin, in the order it is used.
 *
 * `soon: true` marks a module that has a place in the system but no screen
 * yet. Those links still resolve — [...module]/page.tsx renders an honest
 * placeholder that says what will live there and points at the nearest screen
 * that already works — because a dashboard that links to a 404 is worse than
 * one that admits a gap.
 *
 * Nothing is listed twice. "CRM" and "Pipeline" are not separate entries
 * because /admin/leads is already both; giving them their own links would be
 * three doors into one room.
 */

export type NavLink = {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
  soon?: boolean;
  /** Which dashboard counter, if any, badges this link. */
  badge?: "leadsNeedingAttention" | "projectsAtRisk" | "aiProposals";
  /** External to the admin (opens the public site). */
  external?: boolean;
};

export type NavGroup = { head: string; links: NavLink[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    head: "Command",
    links: [
      { href: "/admin", label: "Dashboard", icon: IconGrid },
      { href: "/admin/ai", label: "AI Command Center", icon: IconSpark, soon: true, badge: "aiProposals" },
      { href: "/admin/activity", label: "Activity Center", icon: IconPulse, soon: true },
    ],
  },
  {
    head: "Sales",
    links: [
      { href: "/admin/leads", label: "Leads", icon: IconFunnel, badge: "leadsNeedingAttention" },
      { href: "/admin/crm", label: "CRM", icon: IconInbox },
      { href: "/admin/pipeline", label: "Pipeline", icon: IconChart },
      { href: "/admin/proposals", label: "Proposals", icon: IconFile },
      { href: "/admin/clients", label: "Clients", icon: IconUsers },
    ],
  },
  {
    head: "Projects",
    links: [
      { href: "/admin/jobs", label: "Projects", icon: IconBriefcase, badge: "projectsAtRisk" },
      { href: "/admin/intakes", label: "Client intake", icon: IconBriefcase },
      { href: "/admin/tasks", label: "Tasks", icon: IconCheckSquare, soon: true },
      { href: "/admin/calendar", label: "Calendar", icon: IconCalendar, soon: true },
    ],
  },
  {
    head: "Products & Services",
    links: [
      { href: "/admin/catalog", label: "Catalog", icon: IconLayers },
      { href: "/admin/websites", label: "Websites", icon: IconGlobe },
      { href: "/admin/apps", label: "Apps", icon: IconLayers, soon: true },
      { href: "/admin/ai-solutions", label: "AI Solutions", icon: IconBot, soon: true },
      { href: "/logo-studio", label: "Logo Studio", icon: IconImage, external: true },
      { href: "/admin/hosting", label: "Hosting", icon: IconServer },
      { href: "/admin/software", label: "Software", icon: IconCode, soon: true },
      { href: "/admin/services", label: "Services", icon: IconZap, soon: true },
    ],
  },
  {
    head: "Marketing",
    links: [
      {
        href: "/admin/marketing/campaigns/business-launch",
        label: "Marketing Dashboard",
        icon: IconMegaphone,
      },
      { href: "/admin/marketing/ads", label: "Ad Studio", icon: IconPen },
      { href: "/admin/marketing/spend", label: "Ad spend", icon: IconDollar },
      { href: "/admin/marketing/content", label: "Content Studio", icon: IconImage },
      { href: "/admin/marketing/social", label: "Social Center", icon: IconShare, soon: true },
      { href: "/admin/marketing/email", label: "Email Marketing", icon: IconMail, soon: true },
      { href: "/admin/marketing/seo", label: "SEO", icon: IconGlobe },
      { href: "/admin/marketing/brand", label: "Brand Assets", icon: IconImage, soon: true },
    ],
  },
  {
    head: "Automation",
    links: [
      { href: "/admin/automations", label: "Automations", icon: IconRepeat, soon: true },
      { href: "/admin/automations/workflows", label: "Workflows", icon: IconLayers, soon: true },
      { href: "/admin/ai/agents", label: "AI Agents", icon: IconBot, soon: true },
      { href: "/admin/automations/triggers", label: "Triggers", icon: IconZap, soon: true },
    ],
  },
  {
    head: "Finance",
    links: [
      { href: "/admin/finance", label: "Overview", icon: IconDollar, soon: true },
      { href: "/admin/finance/invoices", label: "Invoices", icon: IconFile, soon: true },
      { href: "/admin/finance/subscriptions", label: "Subscriptions", icon: IconRepeat, soon: true },
      { href: "/admin/finance/expenses", label: "Expenses", icon: IconCart, soon: true },
    ],
  },
  {
    head: "Intelligence",
    links: [
      { href: "/admin/intelligence", label: "Analytics", icon: IconChart, soon: true },
      { href: "/admin/intelligence/leads", label: "Lead analytics", icon: IconFunnel, soon: true },
      { href: "/admin/ai/insights", label: "AI insights", icon: IconSpark, soon: true },
    ],
  },
  {
    head: "System",
    links: [
      { href: "/admin/system/integrations", label: "Integrations", icon: IconServer, soon: true },
      { href: "/admin/system/notifications", label: "Notifications", icon: IconBell, soon: true },
      { href: "/admin/settings", label: "Settings", icon: IconSettings },
    ],
  },
];

/** Every `soon` href, so the placeholder route knows what it is allowed to serve. */
export const SOON_ROUTES: Record<string, { title: string; blurb: string; nearest?: { href: string; label: string } }> = {
  "/admin/ai": {
    title: "AI Command Center",
    blurb:
      "Where the advisor's proposals are reviewed and approved. The queue behind it is already live — ai_actions — and the dashboard's advisor writes into it. This screen is the review desk for it.",
    nearest: { href: "/admin", label: "Ask the advisor on the dashboard" },
  },
  "/admin/ai/agents": {
    title: "AI Agents",
    blurb: "Standing agents that watch one thing each — lead response time, project risk, ad performance — and propose rather than act.",
    nearest: { href: "/admin", label: "Back to the dashboard" },
  },
  "/admin/ai/insights": {
    title: "AI insights",
    blurb:
      "The full history of insights, including the ones dismissed. The five most important are already on the dashboard.",
    nearest: { href: "/admin", label: "See current insights" },
  },
  "/admin/activity": {
    title: "Activity",
    blurb:
      "Everything that has happened across the company, filterable by module and date. The last twelve events are on the dashboard.",
    nearest: { href: "/admin", label: "See recent activity" },
  },
  "/admin/apps": {
    title: "Apps",
    blurb: "Web and mobile applications delivered, with their platform, release state and owner.",
    nearest: { href: "/admin/jobs", label: "Open Projects" },
  },
  "/admin/ai-solutions": {
    title: "AI Solutions",
    blurb:
      "Chatbots, agents and automations built for clients — what each one does, what it runs on, and what it costs to keep running.",
    nearest: { href: "/admin/catalog", label: "Open the catalog" },
  },
  "/admin/software": {
    title: "Software",
    blurb: "Custom software and industry SaaS platforms, with their versions and deployments.",
    nearest: { href: "/admin/catalog", label: "Open the catalog" },
  },
  "/admin/marketing/brand": {
    title: "Brand Assets",
    blurb:
      "Logos, palettes, type and templates — yours and each client's. Logo Studio already generates the marks; this is where they would live afterwards.",
    nearest: { href: "/logo-studio", label: "Open Logo Studio" },
  },
  "/admin/automations/workflows": {
    title: "Workflows",
    blurb:
      "Multi-step sequences across modules — a lead converts, a job opens, a welcome email goes out, a check-in is scheduled. Each step proposes before it acts.",
    nearest: { href: "/admin", label: "Back to the dashboard" },
  },
  "/admin/tasks": {
    title: "Tasks",
    blurb:
      "The full task list, assignable and filterable. Today's tasks — and everything else due today — are already on the dashboard.",
    nearest: { href: "/admin", label: "See today" },
  },
  "/admin/calendar": {
    title: "Calendar",
    blurb: "Meetings, deadlines and scheduled content on one calendar.",
    nearest: { href: "/admin", label: "See today" },
  },
  "/admin/services": {
    title: "Service lines",
    blurb:
      "Per-service configuration and pricing. What each line is earning is on the dashboard; what is sellable is in the catalog.",
    nearest: { href: "/admin/catalog", label: "Open the catalog" },
  },
  "/admin/marketing/social": {
    title: "Social Center",
    blurb:
      "Compose, schedule and publish across channels. Accounts must be connected first — nothing here will show numbers for a platform that has not been linked.",
    nearest: { href: "/admin", label: "Back to the dashboard" },
  },
  "/admin/marketing/email": {
    title: "Email",
    blurb:
      "Broadcast and sequence email. The transactional and follow-up emails already run through Resend.",
    nearest: { href: "/admin/settings", label: "Check email configuration" },
  },
  "/admin/automations": {
    title: "Automations",
    blurb:
      "Rules that run without being asked. One already exists: the 24h and 72h lead follow-up cron.",
    nearest: { href: "/admin/settings", label: "Check automation configuration" },
  },
  "/admin/automations/triggers": {
    title: "Triggers",
    blurb: "What starts an automation — a form, a status change, a date, a webhook.",
  },
  "/admin/finance": {
    title: "Finance overview",
    blurb:
      "Revenue, recurring revenue, expenses and margin over time. The current month is summarised on the dashboard.",
    nearest: { href: "/admin", label: "See this month" },
  },
  "/admin/finance/invoices": {
    title: "Invoices",
    blurb:
      "Every checkout link and its state. Links are created from a lead's own page, which is where the amount is typed.",
    nearest: { href: "/admin/leads", label: "Open the CRM" },
  },
  "/admin/finance/subscriptions": {
    title: "Subscriptions",
    blurb: "Hosting and retainer subscriptions, and what each client contributes to MRR.",
    nearest: { href: "/admin", label: "See MRR" },
  },
  "/admin/finance/expenses": {
    title: "Expenses",
    blurb:
      "Everything the business pays for. Ad spend is tracked separately and added on top so it is never double-counted.",
    nearest: { href: "/admin/marketing/spend", label: "Open ad spend" },
  },
  "/admin/intelligence": {
    title: "Analytics",
    blurb:
      "Website, lead, social and advertising analytics in one place. Website visitor counts need a server-side analytics connection first.",
    nearest: { href: "/admin", label: "See what is measured today" },
  },
  "/admin/intelligence/leads": {
    title: "Lead analytics",
    blurb:
      "Source, campaign and service breakdowns over time, with conversion at each step.",
    nearest: { href: "/admin/marketing/campaigns/business-launch", label: "Open the campaign dashboard" },
  },
  "/admin/system/integrations": {
    title: "Integrations",
    blurb:
      "Connect Meta, Google, Stripe and the social platforms. What is configured today is listed in Settings.",
    nearest: { href: "/admin/settings", label: "Open settings" },
  },
  "/admin/system/notifications": {
    title: "Notifications",
    blurb: "Where alerts go, and which ones are worth interrupting you for.",
    nearest: { href: "/admin", label: "See current alerts" },
  },
};
