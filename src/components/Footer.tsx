import Link from "next/link";
import { BrandMark } from "./BrandMark";
import {
  IconFacebook,
  IconInstagram,
  IconLinkedIn,
  IconMail,
  IconMapPin,
  IconPhone,
  IconYouTube,
} from "./Icons";

const COLUMNS: { head: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    head: "Company",
    links: [
      { label: "About us", href: "/about" },
      { label: "Our work", href: "/work" },
      { label: "How we work", href: "/services#how-we-work" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    head: "Solutions",
    links: [
      { label: "Build your brand", href: "/services" },
      { label: "Run your business", href: "/services" },
      { label: "Grow your audience", href: "/services" },
      { label: "AI & automation", href: "/services" },
    ],
  },
  {
    head: "Resources",
    links: [
      { label: "Blog", href: "/blog" },
      { label: "FAQ", href: "/faq" },
      { label: "Operations audit checklist", href: "/operations-audit" },
      { label: "AI field guide", href: "/ai-field-guide" },
    ],
  },
  {
    head: "Products",
    links: [
      { label: "Job Catcher", href: "/job-catcher" },
      { label: "Held", href: "https://myheldapp.com", external: true },
      { label: "TomorrowsTek", href: "https://tomorrowstek.com", external: true },
      { label: "Custom software", href: "/services" },
    ],
  },
];

const SOCIALS = [
  { href: "https://www.linkedin.com/in/johnhockinson/", label: "LinkedIn", Icon: IconLinkedIn },
  { href: "https://www.youtube.com/@TomorrowsTechAISolution", label: "YouTube", Icon: IconYouTube },
  { href: "https://www.facebook.com/", label: "Facebook", Icon: IconFacebook },
  { href: "https://www.instagram.com/", label: "Instagram", Icon: IconInstagram },
];

export function Footer() {
  return (
    <footer className="border-t border-[color:var(--color-border)] mt-24">
      <div className="max-w-7xl mx-auto px-5 md:px-6 py-14">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,2.4fr)_minmax(0,1.1fr)]">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <BrandMark size={34} />
              <span className="font-bold tracking-[0.06em] text-[15px]">
                TOMORROWSTECH <span className="text-[color:var(--color-blue)]">AI</span>
              </span>
            </div>
            <p className="text-[14px] text-[color:var(--color-text-secondary)] leading-relaxed max-w-xs">
              We build modern businesses.
              <br />
              You build the future.
            </p>
            <div className="flex items-center gap-2 mt-6">
              {SOCIALS.map(({ href, label, Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="tt-social"
                >
                  <Icon size={16} />
                </a>
              ))}
              <a href="mailto:john@tomorrowstechai.com" aria-label="Email" className="tt-social">
                <IconMail size={16} />
              </a>
            </div>
          </div>

          {/* Link columns */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
            {COLUMNS.map(({ head, links }) => (
              <div key={head}>
                <div className="tt-foot-head mb-4">{head}</div>
                <ul className="space-y-2.5">
                  {links.map((link) => (
                    <li key={link.label}>
                      {link.external ? (
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="tt-foot-link"
                        >
                          {link.label}
                        </a>
                      ) : (
                        <Link href={link.href} className="tt-foot-link">
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Contact card */}
          <div className="tt-glass p-6">
            <div className="text-[15px] font-semibold mb-4">Let&apos;s build something great</div>
            <ul className="space-y-3.5 text-[13px]">
              <li className="flex items-start gap-2.5">
                <IconMail size={16} className="text-[color:var(--color-blue)] mt-0.5 shrink-0" />
                <a href="mailto:john@tomorrowstechai.com" className="tt-foot-link break-all">
                  john@tomorrowstechai.com
                </a>
              </li>
              <li className="flex items-start gap-2.5">
                <IconPhone size={16} className="text-[color:var(--color-blue)] mt-0.5 shrink-0" />
                <a href="tel:+12542723313" className="tt-foot-link">
                  (254) 272-3313
                </a>
              </li>
              <li className="flex items-start gap-2.5">
                <IconMapPin size={16} className="text-[color:var(--color-blue)] mt-0.5 shrink-0" />
                <span className="text-[color:var(--color-text-secondary)]">
                  Belton, Texas
                  <br />
                  Serving the USA
                </span>
              </li>
            </ul>
            <Link href="/contact" className="btn-primary w-full justify-center mt-6 text-[12px] uppercase tracking-[0.1em]">
              Start your project
            </Link>
          </div>
        </div>

        <div className="border-t border-[color:var(--color-border-subtle)] mt-12 pt-6 flex flex-col md:flex-row justify-between items-center gap-3 text-[11.5px] text-[color:var(--color-text-muted)]">
          <div>© 2026 Tomorrowstek LLC · TomorrowsTech AI. All rights reserved.</div>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="hover:text-[color:var(--color-blue-bright)] transition-colors">
              Privacy policy
            </Link>
            <Link href="/terms" className="hover:text-[color:var(--color-blue-bright)] transition-colors">
              Terms of service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
