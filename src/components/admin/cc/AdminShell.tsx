"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { NAV_GROUPS, type NavLink as NavLinkT } from "./nav";
import QuickAdd from "./QuickAdd";
import { initials } from "./format";
import { useCollapsed } from "./useCollapsed";
import { IconArrowRight, IconBell, IconLogout, IconMenu, IconSearch, IconX } from "./Icons";

/**
 * The command-centre chrome: sidebar, top bar, and the two popovers that hang
 * off it. Every existing admin screen renders inside it unchanged.
 *
 * Client-side because three things here are interactive — the mobile drawer,
 * the notification popover and Quick Add. The data they display is all
 * rendered on the server and handed down.
 */

export type ShellBadges = {
  leadsNeedingAttention: number;
  projectsAtRisk: number;
  aiProposals: number;
  tasksNeedingAttention: number;
};

export default function AdminShell({
  user,
  badges,
  alertCount,
  alerts,
  signOut,
  children,
}: {
  user: { email: string; name: string | null };
  badges: ShellBadges;
  alertCount: number;
  alerts: ReactNode;
  signOut: () => Promise<void>;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const bellWrap = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [collapsed, setCollapsed] = useCollapsed();

  /**
   * Both popovers remember which page they were opened on, and are treated as
   * closed anywhere else. Navigating therefore closes them with no effect and
   * no extra render — on a phone the drawer would otherwise sit open on top of
   * the page you just asked for.
   */
  const [nav, setNav] = useState({ open: false, at: pathname });
  const [bell, setBell] = useState({ open: false, at: pathname });

  const navOpen = nav.open && nav.at === pathname;
  const bellOpen = bell.open && bell.at === pathname;

  const setNavOpen = (open: boolean) => setNav({ open, at: pathname });
  const setBellOpen = (open: boolean) => setBell({ open, at: pathname });

  useEffect(() => {
    if (!bellOpen) return;
    const onClick = (e: MouseEvent) => {
      if (bellWrap.current && !bellWrap.current.contains(e.target as Node)) {
        // Functional form so the listener does not close over `pathname`.
        setBell((b) => ({ ...b, open: false }));
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [bellOpen]);

  // ⌘K / Ctrl-K focuses search, Escape closes whatever is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape") {
        setNav((n) => ({ ...n, open: false }));
        setBell((b) => ({ ...b, open: false }));
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  const badgeFor = (link: NavLinkT): number => {
    if (!link.badge) return 0;
    return badges[link.badge] ?? 0;
  };

  return (
    <div className={`cc-root cc-shell ${navOpen ? "is-open" : ""} ${collapsed ? "is-collapsed" : ""}`}>
      {navOpen ? (
        <div className="cc-scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />
      ) : null}

      <aside className="cc-side">
        <div className="cc-brand">
          <span className="cc-brand-mark">TT</span>
          <span className="cc-brand-text">
            <b>Tomorrow&rsquo;s Tech AI</b>
            <span>Command Center</span>
          </span>
          <button
            type="button"
            className="cc-icon-btn cc-burger"
            style={{ marginLeft: "auto" }}
            onClick={() => setNavOpen(false)}
            aria-label="Close navigation"
          >
            <IconX size={15} />
          </button>
        </div>

        <nav className="cc-nav" aria-label="Admin">
          {NAV_GROUPS.map((group) => (
            <div key={group.head} className="cc-nav-group">
              <span className="cc-nav-head">{group.head}</span>
              {group.links.map((link) => {
                const n = badgeFor(link);
                const cls = `cc-nav-link ${isActive(link.href) ? "is-active" : ""} ${
                  link.soon ? "is-soon" : ""
                }`;
                const inner = (
                  <>
                    <link.icon size={15} />
                    <span className="cc-nav-label">{link.label}</span>
                    {n > 0 && !link.soon ? (
                      <span
                        className={`cc-nav-badge ${
                          link.badge === "projectsAtRisk" ? "t-risk" : ""
                        }`}
                      >
                        {n}
                      </span>
                    ) : null}
                  </>
                );

                return link.external ? (
                  <a
                    key={link.href}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className={cls}
                    title={link.label}
                  >
                    {inner}
                  </a>
                ) : (
                  <Link key={link.href} href={link.href} className={cls} title={link.label}>
                    {inner}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <button
          type="button"
          className="cc-collapse"
          onClick={() => setCollapsed(!collapsed)}
          aria-pressed={collapsed}
          title={collapsed ? "Expand navigation" : "Collapse navigation"}
        >
          <IconArrowRight size={14} className="cc-collapse-icon" />
          <span className="cc-nav-label">Collapse</span>
        </button>

        <div className="cc-side-foot">
          <span className="cc-avatar">{initials(user.name || user.email)}</span>
          <span className="cc-side-user">
            <b>{user.name || user.email.split("@")[0]}</b>
            <span>Admin</span>
          </span>
          <form action={signOut}>
            <button type="submit" className="cc-signout" aria-label="Sign out" title="Sign out">
              <IconLogout size={15} />
            </button>
          </form>
        </div>
      </aside>

      <div className="cc-main">
        <header className="cc-topbar">
          <button
            type="button"
            className="cc-burger"
            onClick={() => setNavOpen(true)}
            aria-label="Open navigation"
          >
            <IconMenu size={17} />
          </button>

          <form
            className="cc-search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              const q = searchRef.current?.value.trim();
              // Leads are the only searchable index today, and that is where
              // nearly every search actually wants to land.
              router.push(q ? `/admin/leads?q=${encodeURIComponent(q)}` : "/admin/leads");
            }}
          >
            <IconSearch size={15} />
            <input
              ref={searchRef}
              type="search"
              name="q"
              placeholder="Search leads, businesses, email…"
              aria-label="Search"
            />
          </form>

          <div className="cc-topbar-spacer" />

          <div className="cc-menu-wrap" ref={bellWrap}>
            <button
              type="button"
              className="cc-icon-btn"
              onClick={() => setBellOpen(!bellOpen)}
              aria-label={`Alerts${alertCount > 0 ? ` (${alertCount})` : ""}`}
              aria-expanded={bellOpen}
            >
              <IconBell size={16} />
              {alertCount > 0 ? <span className="cc-pip" /> : null}
            </button>
            {bellOpen ? (
              <div className="cc-pop">
                <div className="cc-pop-head">
                  Alerts {alertCount > 0 ? `· ${alertCount}` : ""}
                </div>
                {alerts}
              </div>
            ) : null}
          </div>

          <QuickAdd />
        </header>

        <main className="cc-page">{children}</main>
      </div>
    </div>
  );
}
