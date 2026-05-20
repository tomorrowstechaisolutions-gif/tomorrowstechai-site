"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/services", label: "Services" },
  { href: "/work", label: "Work" },
  { href: "/about", label: "About" },
  { href: "/blog", label: "Blog" },
  { href: "/faq", label: "FAQ" },
];

export function Header() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close mobile menu on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="border-b border-[color:var(--color-border)] bg-[color:var(--color-bg)]/80 backdrop-blur sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-5 md:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 md:gap-3 group shrink-0">
          <Image
            src="/logo.png"
            alt="TomorrowsTech AI"
            width={32}
            height={32}
            priority
            className="rounded-sm w-8 h-8 md:w-9 md:h-9"
          />
          <span className="font-medium tracking-wide text-[13px] md:text-[15px] whitespace-nowrap">
            TOMORROWS<span className="text-[color:var(--color-cyan)]">TECH</span> AI
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-7 text-sm">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text)] transition-colors"
            >
              {link.label}
            </Link>
          ))}
          <Link href="/contact" className="btn-primary">
            Book a call →
          </Link>
        </nav>

        {/* Mobile menu button */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-nav"
          className="md:hidden w-10 h-10 -mr-2 flex items-center justify-center text-[color:var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-cyan)] rounded"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
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

      {/* Mobile drawer */}
      <div
        id="mobile-nav"
        className={`md:hidden fixed inset-x-0 top-16 z-40 bg-[color:var(--color-bg)] border-b border-[color:var(--color-border)] overflow-hidden transition-[max-height] duration-300 ease-out ${
          open ? "max-h-[80vh]" : "max-h-0"
        }`}
      >
        <nav className="max-w-6xl mx-auto px-5 py-4 flex flex-col">
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`py-3.5 text-base border-b border-[color:var(--color-border-subtle)] flex items-center justify-between ${
                  active
                    ? "text-[color:var(--color-cyan)]"
                    : "text-[color:var(--color-text)] hover:text-[color:var(--color-cyan)]"
                } transition-colors`}
              >
                <span>{link.label}</span>
                <span className="font-mono text-xs text-[color:var(--color-text-muted)] tracking-widest">
                  →
                </span>
              </Link>
            );
          })}
          <Link href="/contact" className="btn-primary mt-5 mb-2 justify-center text-base py-3">
            Book a call →
          </Link>
        </nav>
      </div>

      {/* Backdrop dimmer (mobile only, fades behind drawer) */}
      {open && (
        <div
          className="md:hidden fixed inset-0 top-16 z-30 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}
    </header>
  );
}
