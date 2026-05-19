import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-[color:var(--color-border)] mt-32">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 bg-[color:var(--color-cyan)]" />
              <span className="font-medium tracking-wide text-[15px]">
                TOMORROWS<span className="text-[color:var(--color-cyan)]">TECH</span> AI
              </span>
            </div>
            <p className="text-sm text-[color:var(--color-text-secondary)] leading-relaxed">
              AI command centers for construction, contractors, and field
              operations. Operations first, AI second.
            </p>
          </div>
          <div>
            <div className="eyebrow-muted mb-4">Services</div>
            <ul className="space-y-2 text-sm">
              <li><Link href="/services" className="text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-cyan)] transition-colors">AI Command Centers</Link></li>
              <li><Link href="/services" className="text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-cyan)] transition-colors">Smartsheet Consulting</Link></li>
              <li><Link href="/services" className="text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-cyan)] transition-colors">Custom AI Apps</Link></li>
              <li><Link href="/services" className="text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-cyan)] transition-colors">Local AI Deployment</Link></li>
            </ul>
          </div>
          <div>
            <div className="eyebrow-muted mb-4">Products</div>
            <ul className="space-y-2 text-sm">
              <li><a href="https://myheldapp.com" className="text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-cyan)] transition-colors">Held</a></li>
              <li><span className="text-[color:var(--color-text-secondary)]">NexaFlow AI</span></li>
              <li><span className="text-[color:var(--color-text-secondary)]">REI Ops Local</span></li>
            </ul>
          </div>
          <div>
            <div className="eyebrow-muted mb-4">Connect</div>
            <ul className="space-y-2 text-sm">
              <li><a href="https://www.linkedin.com/in/johnhockinson/" className="text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-cyan)] transition-colors">LinkedIn</a></li>
              <li><a href="https://www.youtube.com/@tomorrowstek" className="text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-cyan)] transition-colors">YouTube</a></li>
              <li><Link href="/contact" className="text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-cyan)] transition-colors">Contact</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-[color:var(--color-border)] mt-10 pt-6 flex justify-between items-center text-xs text-[color:var(--color-text-muted)] font-mono uppercase tracking-wider">
          <div>© 2026 TomorrowsTech AI Solutions</div>
          <div className="text-[color:var(--color-cyan)]">Propose · Never Act</div>
          <div>Build · v0.1</div>
        </div>
      </div>
    </footer>
  );
}
