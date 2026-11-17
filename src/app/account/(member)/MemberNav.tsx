"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/account", label: "Overview" },
  { href: "/account/services", label: "Services" },
  { href: "/account/invoices", label: "Invoices" },
  { href: "/account/more", label: "More services" },
  { href: "/account/profile", label: "Profile" },
  { href: "/account/help", label: "Get help" },
];

export function MemberNav() {
  const path = usePathname() ?? "";
  return (
    <nav className="acct-tabs" aria-label="Account sections">
      {TABS.map((t) => {
        const on = t.href === "/account" ? path === "/account" : path.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} className={on ? "is-on" : ""} aria-current={on ? "page" : undefined}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
