import type { ComponentType, SVGProps } from "react";
import {
  IconBell,
  IconBot,
  IconBriefcase,
  IconCalendar,
  IconCart,
  IconChart,
  IconCheckSquare,
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
  IconVideo,
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
 * One door per room. Where two screens read the same records, the sidebar
 * lists one and that screen links to the other: Hosting sits behind Websites,
 * the Zoom Conference Center behind Meetings, the Catalog behind Services and
 * Software behind Apps. `also` keeps the sidebar entry lit while you are on
 * the screen behind it. The pages themselves are unchanged and their URLs
 * still work.
 *
 * A module with no screen yet is not listed at all. Its URL still resolves to
 * the placeholder (SOON_ROUTES below) so an old link never 404s, but a
 * sidebar entry that opens "not built yet" is noise.
 */

export type NavLink = {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
  soon?: boolean;
  /** Which dashboard counter, if any, badges this link. */
  badge?:
    | "leadsNeedingAttention" | "projectsAtRisk"
    | "aiProposals" | "tasksNeedingAttention" | "eventsToday" | "meetingsToday";
  /** External to the admin (opens the public site). */
  external?: boolean;
  /** Other paths this entry stands for, so it stays highlighted on them. */
  also?: string[];
};

export type NavGroup = { head: string; links: NavLink[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    head: "Command",
    links: [
      // The lead AI and her crew. The floor sits behind this entry.
      { href: "/admin/ai", label: "Tess", icon: IconSpark, also: ["/admin/ai/floor"] },
      // What Tess says to visitors on the public site, and her recordings.
      { href: "/admin/guide", label: "Site Guide", icon: IconSpark },
      { href: "/admin", label: "Dashboard", icon: IconGrid },
      // Gmail for tomorrowstechaisolutions@gmail.com, matched against the CRM.
      { href: "/admin/inbox", label: "Inbox", icon: IconMail },
      { href: "/admin/activity", label: "Activity Center", icon: IconPulse },
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
      // Businesses you sell THROUGH (white-label, revenue share) — not a client list.
      { href: "/admin/partners", label: "Partners", icon: IconShare },
      // Last, because it is last in the work: proposal → both parties agree →
      // the work happens → the invoice. It sits under Sales rather than
      // Finance because raising one is part of closing the sale, and because
      // a screen you use weekly should not be three groups down the sidebar.
      { href: "/admin/invoices", label: "Invoices", icon: IconDollar },
    ],
  },
  {
    head: "Projects",
    links: [
      { href: "/admin/jobs", label: "Projects", icon: IconBriefcase, badge: "projectsAtRisk" },
      { href: "/admin/intakes", label: "Client intake", icon: IconBriefcase },
      { href: "/admin/tasks", label: "Tasks", icon: IconCheckSquare, badge: "tasksNeedingAttention" },
      { href: "/admin/calendar", label: "Calendar", icon: IconCalendar, badge: "eventsToday" },
      // Meetings and the Zoom Conference Center read the same meetings.
      { href: "/admin/meetings", label: "Meetings", icon: IconVideo, badge: "meetingsToday", also: ["/admin/conference-center"] },
    ],
  },
  {
    head: "Products & Services",
    links: [
      // What is sold: services, the packages built from them, and the
      // read-only catalog of both (behind Services).
      { href: "/admin/services", label: "Services", icon: IconZap, also: ["/admin/catalog"] },
      { href: "/admin/packages", label: "Packages", icon: IconCart },
      // What is run: sites (hosting and its costs behind it), then products
      // (software products behind it), then the AI systems.
      { href: "/admin/websites", label: "Websites", icon: IconGlobe, also: ["/admin/hosting"] },
      { href: "/admin/apps", label: "Apps", icon: IconLayers, also: ["/admin/software"] },
      { href: "/admin/ai-solutions", label: "AI Solutions", icon: IconBot },
      { href: "/logo-studio", label: "Logo Studio", icon: IconImage, external: true },
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
      { href: "/admin/blog", label: "Blog", icon: IconFile },
      { href: "/admin/marketing/content", label: "Content Studio", icon: IconImage },
      { href: "/admin/marketing/social", label: "Social Center", icon: IconShare },
      { href: "/admin/marketing/email", label: "Email Marketing", icon: IconMail },
      { href: "/admin/marketing/seo", label: "SEO", icon: IconGlobe },
      { href: "/admin/marketing/brand", label: "Brand Assets", icon: IconImage },
    ],
  },
  {
    head: "Automation",
    links: [
      { href: "/admin/automations", label: "Automations", icon: IconRepeat },
      { href: "/admin/automations/workflows", label: "Workflows", icon: IconLayers },
    ],
  },
  {
    head: "Finance",
    links: [
      { href: "/admin/finance", label: "Overview", icon: IconDollar },
      { href: "/admin/finance/subscriptions", label: "Subscriptions", icon: IconRepeat },
      { href: "/admin/finance/expenses", label: "Expenses", icon: IconCart },
    ],
  },
  {
    head: "Intelligence",
    links: [
      { href: "/admin/intelligence", label: "Analytics", icon: IconChart },
      { href: "/admin/intelligence/leads", label: "Lead analytics", icon: IconFunnel },
      { href: "/admin/ai/insights", label: "AI insights", icon: IconSpark },
    ],
  },
  {
    head: "System",
    links: [
      { href: "/admin/system/integrations", label: "Integrations", icon: IconServer },
      { href: "/admin/system/notifications", label: "Notifications", icon: IconBell },
      { href: "/admin/system/emails", label: "System emails", icon: IconMail },
      { href: "/admin/settings/agreements", label: "Agreements", icon: IconFile },
      { href: "/admin/settings", label: "Settings", icon: IconSettings },
    ],
  },
];

/**
 * Planned modules with no screen yet. None of them is in the sidebar; these
 * URLs resolve to an honest placeholder so an old link or bookmark does not
 * 404. Delete an entry the day its real page ships.
 */
export const SOON_ROUTES: Record<string, { title: string; blurb: string; nearest?: { href: string; label: string } }> = {
  "/admin/ai/agents": {
    title: "AI Agents",
    blurb: "Standing agents that watch one thing each — lead response time, project risk, ad performance — and propose rather than act.",
    nearest: { href: "/admin", label: "Back to the dashboard" },
  },
  "/admin/automations/triggers": {
    title: "Triggers",
    blurb: "What starts an automation — a form, a status change, a date, a webhook.",
  },
};
