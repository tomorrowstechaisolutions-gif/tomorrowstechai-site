import Link from "next/link";

export function Header() {
  return (
    <header className="border-b border-[color:var(--color-border)] bg-[color:var(--color-bg)]/80 backdrop-blur sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-2 h-2 bg-[color:var(--color-cyan)]" />
          <span className="font-medium tracking-wide text-[15px]">
            TOMORROWS<span className="text-[color:var(--color-cyan)]">TECH</span> AI
          </span>
        </Link>
        <nav className="flex items-center gap-7 text-sm">
          <Link
            href="/services"
            className="text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text)] transition-colors"
          >
            Services
          </Link>
          <Link
            href="/about"
            className="text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text)] transition-colors"
          >
            About
          </Link>
          <Link
            href="/blog"
            className="text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text)] transition-colors"
          >
            Blog
          </Link>
          <Link href="/contact" className="btn-primary">
            Book a call →
          </Link>
        </nav>
      </div>
    </header>
  );
}
