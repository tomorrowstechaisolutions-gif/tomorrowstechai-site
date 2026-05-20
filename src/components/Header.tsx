import Link from "next/link";
import Image from "next/image";

export function Header() {
  return (
    <header className="border-b border-[color:var(--color-border)] bg-[color:var(--color-bg)]/80 backdrop-blur sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group">
          <Image
            src="/logo.png"
            alt="TomorrowsTech AI"
            width={36}
            height={36}
            priority
            className="rounded-sm"
          />
          <span className="font-medium tracking-wide text-[15px]">
            TOMORROWS<span className="text-[color:var(--color-cyan)]">TECH</span> AI
          </span>
        </Link>
        <nav className="flex items-center gap-7 text-sm">
          <Link href="/services" className="text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text)] transition-colors">Services</Link>
          <Link href="/work" className="text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text)] transition-colors">Work</Link>
          <Link href="/about" className="text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text)] transition-colors">About</Link>
          <Link href="/blog" className="text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text)] transition-colors">Blog</Link>
          <Link href="/contact" className="btn-primary">Book a call →</Link>
        </nav>
      </div>
    </header>
  );
}
