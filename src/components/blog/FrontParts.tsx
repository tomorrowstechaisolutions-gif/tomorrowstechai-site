import Link from "next/link";
import Image from "next/image";
import type { Article, CategorySlug } from "@/lib/blog/types";
import { CATEGORIES, categoryPath } from "@/lib/blog/taxonomy";
import { NewsletterForm } from "@/components/NewsletterForm";
import { Kicker } from "./ArticleParts";
import { CategoryLabel } from "./CategoryLabel";

/** Front page and category page building blocks for Field Notes. */

export function Masthead({
  title,
  dek,
  count,
  latest,
  query,
}: {
  title: string;
  dek: string;
  count: number;
  latest: string | null;
  query?: string;
}) {
  return (
    <header className="fnf-mast">
      <div className="fnf-mast-text">
        <p className="fnf-dateline">
          <span>Central Texas</span>
          <span aria-hidden="true">·</span>
          <span>
            {count} {count === 1 ? "article" : "articles"}
          </span>
          {latest && (
            <>
              <span aria-hidden="true">·</span>
              <span>Updated {latest}</span>
            </>
          )}
        </p>
        <h1 className="fnf-title">
          {title}
          <span aria-hidden="true">.</span>
        </h1>
        <p className="fnf-dek">{dek}</p>
      </div>
      <div className="fnf-mast-tools">
        <form action="/blog" method="get" role="search" className="fnf-search">
          <label htmlFor="fnf-q" className="sr-only">
            Search Field Notes
          </label>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input id="fnf-q" name="q" type="search" placeholder="Search articles" defaultValue={query} autoComplete="off" />
          <button type="submit">Search</button>
        </form>
        <a href="/blog/feed.xml" className="fnf-rss">
          RSS feed
        </a>
      </div>
    </header>
  );
}

export function CategoryBar({ active }: { active: CategorySlug | "all" }) {
  return (
    <nav className="fnf-cats" aria-label="Field Notes sections">
      <ul>
        <li>
          <Link href="/blog" aria-current={active === "all" ? "page" : undefined}>
            All
          </Link>
        </li>
        {CATEGORIES.map((c) => (
          <li key={c.slug}>
            <Link href={categoryPath(c.slug)} aria-current={active === c.slug ? "page" : undefined}>
              {c.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** logDate: the date already shows in the margin stamp, so hide it here on wide screens. */
function Meta({ a, logDate = false }: { a: Article; logDate?: boolean }) {
  return (
    <p className="fnf-meta">
      <span className={logDate ? "fnf-meta-date" : undefined}>
        <time dateTime={a.publishedAt}>{a.displayDate}</time>
        <span aria-hidden="true"> · </span>
      </span>
      {a.readTimeLabel}
    </p>
  );
}

export function LeadStory({ a }: { a: Article }) {
  return (
    <article className="fnf-lead">
      <Link href={a.path} className="fnf-lead-link">
        {a.hero && (
          <div className="fnf-media fnf-media-lead">
            <Image
              src={a.hero.src}
              alt={a.hero.alt}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 720px"
              className="object-cover"
            />
          </div>
        )}
        <div className="fnf-lead-body">
          <Kicker article={a} />
          <h2>{a.title}</h2>
          <p className="fnf-summary">{a.summary}</p>
          <p className="fnf-meta">
            <span>By {a.author.name}</span>
            <span aria-hidden="true"> · </span>
            <time dateTime={a.publishedAt}>{a.displayDate}</time>
            <span aria-hidden="true"> · </span>
            {a.readTimeLabel}
          </p>
        </div>
      </Link>
    </article>
  );
}

export function SecondaryStory({ a }: { a: Article }) {
  return (
    <article className="fnf-second">
      <Link href={a.path}>
        {a.hero && (
          <div className="fnf-media">
            <Image src={a.hero.src} alt={a.hero.alt} fill sizes="(max-width: 1024px) 40vw, 340px" className="object-cover" />
          </div>
        )}
        <div className="fnf-second-body">
          <Kicker article={a} />
          <h3>{a.title}</h3>
          <Meta a={a} />
        </div>
      </Link>
    </article>
  );
}

/** One entry in the log: date in the margin, story, thumbnail. */
export function RiverItem({ a }: { a: Article }) {
  const [month, day, year] = a.displayDate.replace(",", "").split(" ");
  return (
    <article className="fnf-river-item">
      <Link href={a.path}>
        <p className="fnf-stamp" aria-hidden="true">
          <span>
            {month.slice(0, 3)} {day}
          </span>
          <span>{year}</span>
        </p>
        <div className="fnf-river-body">
          <Kicker article={a} />
          <h3>{a.title}</h3>
          <p className="fnf-summary">{a.summary}</p>
          <Meta a={a} logDate />
        </div>
        {a.hero && (
          <div className="fnf-media fnf-media-thumb">
            <Image src={a.hero.src} alt={a.hero.alt} fill sizes="(max-width: 640px) 96px, 220px" className="object-cover" />
          </div>
        )}
      </Link>
    </article>
  );
}

export function SectionHead({ id, title, href, linkLabel }: { id?: string; title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="fnf-sec-head">
      <h2 id={id}>{title}</h2>
      {href && (
        <Link href={href} className="fnf-sec-link">
          {linkLabel ?? "See all"} →
        </Link>
      )}
    </div>
  );
}

export function Rail({ counts }: { counts: Record<CategorySlug, number> }) {
  return (
    <aside className="fnf-rail" aria-label="More from Field Notes">
      <section className="fnf-box" aria-labelledby="fnf-sections">
        <h2 id="fnf-sections" className="fnf-box-title">
          Sections
        </h2>
        <ul className="fnf-section-list">
          {CATEGORIES.map((c) => (
            <li key={c.slug}>
              <Link href={categoryPath(c.slug)}>
                <CategoryLabel slug={c.slug} name={c.name} />
                <span className="fnf-count">{counts[c.slug]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="fnf-box" aria-labelledby="fnf-news">
        <h2 id="fnf-news" className="fnf-box-title">
          Field Notes by email
        </h2>
        <p>New articles when they publish. Unsubscribe any time.</p>
        <NewsletterForm stacked />
      </section>

      <section className="fnf-box fnf-box-cta" aria-labelledby="fnf-work">
        <h2 id="fnf-work" className="fnf-box-title">
          Work with us
        </h2>
        <p>Command centers, workflow systems and private AI, built around how your business runs.</p>
        <Link href="/contact" className="fnf-sec-link">
          Book a discovery call →
        </Link>
      </section>
    </aside>
  );
}

export function EmptySection({ name }: { name: string }) {
  return (
    <div className="fnf-empty">
      <p className="fnf-empty-title">No {name} articles yet.</p>
      <p>New sections fill up as we publish. Browse the latest from every section below.</p>
    </div>
  );
}
