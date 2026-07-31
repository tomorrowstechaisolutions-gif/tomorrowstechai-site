import Link from "next/link";
import { BrandMark } from "./BrandMark";

export function Footer() {
  return (
    <footer className="border-t border-[color:var(--color-border)] mt-32">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <BrandMark size={38} />
              <span className="font-medium tracking-[0.08em] text-[14px]">
                TOMORROWS <span className="text-[color:var(--color-cyan)]">TECH AI</span>
              </span>
            </div>
            <p className="text-sm text-[color:var(--color-text-secondary)] leading-relaxed">
              Custom business operating platforms—modern websites, private
              admin systems, CRM, command centers, apps, workflows, and AI
              built around one business.
            </p>
          </div>
          <div>
            <div className="eyebrow-muted mb-4">Explore</div>
            <ul className="space-y-2 text-sm">
              <li><Link href="/services" className="text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-cyan)] transition-colors">Services</Link></li>
              <li><Link href="/work" className="text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-cyan)] transition-colors">Work</Link></li>
              <li><Link href="/about" className="text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-cyan)] transition-colors">About</Link></li>
              <li><Link href="/blog" className="text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-cyan)] transition-colors">Blog</Link></li>
              <li><Link href="/faq" className="text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-cyan)] transition-colors">FAQ</Link></li>
              <li><Link href="/operations-audit" className="text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-cyan)] transition-colors">Free checklist</Link></li>
              <li><Link href="/ai-field-guide" className="text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-cyan)] transition-colors">Free AI guide</Link></li>
              <li><Link href="/contact" className="text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-cyan)] transition-colors">Contact</Link></li>
            </ul>
          </div>
          <div>
            <div className="eyebrow-muted mb-4">Products & brands</div>
            <ul className="space-y-2 text-sm">
              <li><Link href="/job-catcher" className="text-[color:var(--color-cyan)] hover:text-[color:var(--color-text)] transition-colors">Job Catcher — Contractor lead automation</Link></li>
              <li><a href="https://myheldapp.com" target="_blank" rel="noopener noreferrer" className="text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-cyan)] transition-colors">Held — Family ops app</a></li>
              <li><span className="text-[color:var(--color-text-secondary)]">NexaFlow AI — Local AI OS</span></li>
              <li><span className="text-[color:var(--color-text-secondary)]">REI Ops Local — REI platform</span></li>
              <li><a href="https://tomorrowstek.com" target="_blank" rel="noopener noreferrer" className="text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-cyan)] transition-colors">TomorrowsTek — Media</a></li>
            </ul>
          </div>
          <div>
            <div className="eyebrow-muted mb-4">Connect</div>
            <ul className="space-y-2 text-sm">
              <li><a href="https://www.linkedin.com/in/johnhockinson/" target="_blank" rel="noopener noreferrer" className="text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-cyan)] transition-colors">LinkedIn</a></li>
              <li><a href="https://www.youtube.com/@TomorrowsTechAISolution" target="_blank" rel="noopener noreferrer" className="text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-cyan)] transition-colors">YouTube</a></li>
              <li><Link href="/contact" className="text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-cyan)] transition-colors">Book a call</Link></li>
              <li><a href="tel:+12542723313" className="text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-cyan)] transition-colors">(254) 272-3313</a></li>
              <li><a href="mailto:john@tomorrowstechai.com" className="text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-cyan)] transition-colors">john@tomorrowstechai.com</a></li>
              <li><span className="text-[color:var(--color-text-secondary)]">Tomorrows Tech AI LLC<br />452 Eagle Landing Dr<br />Belton, TX 76513</span></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-[color:var(--color-border)] mt-10 pt-6 flex flex-col md:flex-row justify-between items-center gap-3 text-xs text-[color:var(--color-text-muted)] font-mono uppercase tracking-wider">
          <div>© 2026 Tomorrowstek LLC · TomorrowsTech AI</div>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-[color:var(--color-cyan)] transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-[color:var(--color-cyan)] transition-colors">Terms</Link>
            <span className="text-[color:var(--color-cyan)]">Propose · Never Act</span>
          </div>
          <div>Build · v0.1</div>
        </div>
      </div>
    </footer>
  );
}
