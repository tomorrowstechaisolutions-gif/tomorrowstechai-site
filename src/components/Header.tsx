"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { BrandMark } from "./BrandMark";
import { SoundToggle } from "./fx/UiSound";
import {
  IconArrowRight,
  IconBadgeCheck,
  IconBrain,
  IconBrush,
  IconChart,
  IconChevronDown,
  IconCode,
  IconDashboard,
  IconLock,
  IconMegaphone,
  IconRocket,
} from "./Icons";

type MegaItem = {
  href: string;
  label: string;
  blurb: string;
  external?: boolean;
};

type NavEntry = {
  label: string;
  href: string;
  items?: MegaItem[];
  /** Column count for the dropdown panel on desktop. */
  cols?: 1 | 2;
};

/**
 * The five capability layers. Until the dedicated /solutions/* routes exist
 * these all resolve to the services page, which is the current home for this
 * content — no dead links.
 */
const SOLUTIONS: MegaItem[] = [
  {
    href: "/services",
    label: "Build your business",
    blurb: "Brand, logo, website, hosting, SEO, ecommerce, 3D experiences.",
  },
  {
    href: "/services",
    label: "Run your business",
    blurb: "Admin center, dashboard, CRM, scheduling, orders, documents.",
  },
  {
    href: "/services",
    label: "Grow your audience",
    blurb: "Social center, content, campaigns, lead gen, reputation.",
  },
  {
    href: "/services",
    label: "Intelligence & automation",
    blurb: "AI assistants, workflow automation, reporting, custom agents.",
  },
  {
    href: "/services",
    label: "Technology & software",
    blurb: "Custom apps, SaaS, computer builds, local AI, integrations.",
  },
];

const PRODUCTS: MegaItem[] = [
  {
    href: "/logo-studio",
    label: "Logo Studio",
    blurb: "Create a logo in minutes, then have it refined by hand.",
  },
  {
    href: "/job-catcher",
    label: "Job Catcher",
    blurb: "Managed missed-call response for contractors.",
  },
  {
    href: "https://myheldapp.com",
    label: "Held",
    blurb: "Family operations app.",
    external: true,
  },
  {
    href: "https://tomorrowstek.com",
    label: "TomorrowsTek",
    blurb: "Media, computer builds, and hardware.",
    external: true,
  },
  {
    href: "/services",
    label: "Custom software",
    blurb: "Apps, SaaS products, and internal tools built to order.",
  },
];

const RESOURCES: MegaItem[] = [
  { href: "/blog", label: "Blog", blurb: "Notes from the field on systems and AI." },
  { href: "/faq", label: "FAQ", blurb: "How we scope, price, and build." },
  {
    href: "/operations-audit",
    label: "Operations audit checklist",
    blurb: "Free 3-page PDF — 12 questions before adding AI.",
  },
  {
    href: "/ai-field-guide",
    label: "AI field guide",
    blurb: "Free guide: your best next hire is AI.",
  },
];

const NAV: NavEntry[] = [
  { label: "Solutions", href: "/services", items: SOLUTIONS, cols: 1 },
  { label: "Logo Studio", href: "/logo-studio" },
  { label: "Our Work", href: "/work" },
  { label: "Products", href: "/services", items: PRODUCTS, cols: 1 },
  { label: "About", href: "/about" },
  { label: "Resources", href: "/blog", items: RESOURCES, cols: 1 },
];

const TRUST = [
  {
    Icon: IconBadgeCheck,
    title: "Built around you",
    blurb: "Your business. Your data. Your future.",
  },
  {
    Icon: IconBrain,
    title: "AI-powered",
    blurb: "Intelligence built in. Not bolted on.",
  },
  {
    Icon: IconLock,
    title: "Secure by design",
    blurb: "Enterprise-grade security.",
  },
  {
    Icon: IconChart,
    title: "Real results",
    blurb: "Systems that scale. Results that last.",
  },
];

const MEGA_ICONS = [IconBrush, IconDashboard, IconMegaphone, IconBrain, IconCode];

export function Header() {
  const [open, setOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const pathname = usePathname();

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  /** Every drawer link calls this so navigating closes the drawer. */
  const closeDrawer = () => {
    setOpen(false);
    setOpenGroup(null);
  };

  return (
    <>
      <header className="tt-header">
        <div className="max-w-7xl mx-auto px-5 md:px-6 h-[68px] flex items-center justify-between gap-6">
          <Link href="/" className="flex items-center gap-3 group shrink-0">
            <BrandMark size={34} className="transition-transform duration-300 group-hover:scale-[1.05]" />
            <span className="tt-wordmark text-[13px] md:text-[15.5px] whitespace-nowrap">
              <span className="tt-wordmark-metal">TOMORROW’S TECH</span>{" "}
              <span className="tt-wordmark-ai">AI</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-8 xl:gap-10" aria-label="Main">
            {NAV.map((entry) => {
              const active = pathname === entry.href;
              if (!entry.items) {
                return (
                  <Link
                    key={entry.label}
                    href={entry.href}
                    className="tt-nav-link"
                    data-active={active}
                  >
                    {entry.label}
                  </Link>
                );
              }
              return (
                <div key={entry.label} className="tt-nav-item" data-sfx="open">
                  <Link href={entry.href} className="tt-nav-link" data-active={active}>
                    {entry.label}
                    <IconChevronDown size={14} />
                  </Link>
                  <div className="tt-mega w-[380px]">
                    {entry.items.map((item, i) => {
                      const Icon = MEGA_ICONS[i % MEGA_ICONS.length];
                      const inner = (
                        <>
                          <span className="tt-icon-tile !w-9 !h-9 !rounded-lg">
                            <Icon size={17} />
                          </span>
                          <span className="min-w-0">
                            <strong>{item.label}</strong>
                            <span>{item.blurb}</span>
                          </span>
                        </>
                      );
                      return item.external ? (
                        <a
                          key={item.label}
                          href={item.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="tt-mega-link"
                        >
                          {inner}
                        </a>
                      ) : (
                        <Link key={item.label} href={item.href} className="tt-mega-link">
                          {inner}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            <SoundToggle className="tt-sound-toggle hidden sm:inline-flex" />

            <Link href="/contact" className="tt-cta-outline hidden sm:inline-flex" data-magnetic data-sfx="cta">
              <IconRocket size={16} className="text-[color:var(--color-blue-bright)]" />
              Build my business
              <IconArrowRight size={15} />
            </Link>

            {/* Mobile menu button */}
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="mobile-nav"
              className="lg:hidden w-10 h-10 -mr-2 flex items-center justify-center text-[color:var(--color-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blue)] rounded"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                {open ? (
                  <>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </>
                ) : (
                  <>
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                  </>
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile drawer */}
        <div
          id="mobile-nav"
          className={`lg:hidden fixed inset-x-0 top-[68px] z-40 bg-[color:var(--color-bg)] border-b border-[color:var(--color-border)] overflow-y-auto transition-[max-height] duration-300 ease-out ${
            open ? "max-h-[calc(100vh-68px)]" : "max-h-0"
          }`}
        >
          <nav className="max-w-7xl mx-auto px-5 py-4 flex flex-col" aria-label="Mobile">
            {NAV.map((entry) => {
              if (!entry.items) {
                return (
                  <Link
                    key={entry.label}
                    href={entry.href}
                    onClick={closeDrawer}
                    className="py-3.5 text-base font-medium border-b border-[color:var(--color-border-subtle)] flex items-center justify-between"
                  >
                    <span>{entry.label}</span>
                    <IconArrowRight size={16} className="text-[color:var(--color-text-muted)]" />
                  </Link>
                );
              }
              const expanded = openGroup === entry.label;
              return (
                <div key={entry.label} className="border-b border-[color:var(--color-border-subtle)]">
                  <button
                    type="button"
                    onClick={() => setOpenGroup(expanded ? null : entry.label)}
                    aria-expanded={expanded}
                    className="w-full py-3.5 text-base font-medium flex items-center justify-between"
                  >
                    <span>{entry.label}</span>
                    <IconChevronDown
                      size={17}
                      className={`text-[color:var(--color-text-muted)] transition-transform ${
                        expanded ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  <div
                    className={`grid transition-[grid-template-rows] duration-300 ${
                      expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="pb-3 pl-1 flex flex-col">
                        {entry.items.map((item) =>
                          item.external ? (
                            <a
                              key={item.label}
                              href={item.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={closeDrawer}
                              className="py-2.5 text-sm text-[color:var(--color-text-secondary)]"
                            >
                              {item.label}
                            </a>
                          ) : (
                            <Link
                              key={item.label}
                              href={item.href}
                              onClick={closeDrawer}
                              className="py-2.5 text-sm text-[color:var(--color-text-secondary)]"
                            >
                              {item.label}
                            </Link>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            <Link
              href="/contact"
              onClick={closeDrawer}
              className="btn-primary mt-5 mb-3 justify-center text-base py-3"
            >
              Build my business
              <IconArrowRight size={16} />
            </Link>
          </nav>
        </div>

        {/* Backdrop */}
        {open && (
          <div
            className="lg:hidden fixed inset-0 top-[68px] z-30 bg-black/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
        )}
      </header>

      {/* Trust strip — sits below the sticky bar so the sticky header stays one row tall */}
      <div className="tt-trust">
        {TRUST.map(({ Icon, title, blurb }) => (
          <div key={title}>
            <Icon size={22} className="text-[color:var(--color-blue-bright)] shrink-0" />
            <div className="min-w-0">
              <strong>{title}</strong>
              <span>{blurb}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
