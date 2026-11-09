import Link from "next/link";
import Image from "next/image";
import type { Article } from "@/lib/blog/types";
import { formatDate } from "@/lib/blog/repository";
import { categoryPath, getCategory } from "@/lib/blog/taxonomy";
import { ShareLinks } from "./ShareLinks";
import { articleContactHref, type CtaPosition } from "@/lib/blog/lead-attribution";
import { CategoryLabel } from "./CategoryLabel";

export { accentFor } from "./CategoryLabel";

/** Contact link tagged with the article and the button's position (CRM attribution). */
/** The article's own service CTA when it sets one, else its category's. */
export function ctaFor(a: Article) {
  return a.cta ?? a.categoryInfo.cta;
}

export function contactHref(a: Article, cta: CtaPosition): string {
  return articleContactHref(ctaFor(a).service, a.path, cta);
}

function initials(name: string): string {
  if (name.startsWith("Tomorrow")) return "TT";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function Kicker({ article }: { article: Pick<Article, "category" | "categoryInfo"> }) {
  return <CategoryLabel slug={article.category} name={article.categoryInfo.name} />;
}

export function ArticleHeader({ article, draft }: { article: Article; draft: boolean }) {
  return (
    <header className="fn-head">
      {draft && (
        <p className="fn-draft" role="status">
          Draft preview · only visible on a local dev server · not published
        </p>
      )}
      <nav aria-label="Breadcrumb" className="fn-crumbs">
        <ol>
          <li>
            <Link href="/blog">Field Notes</Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href={categoryPath(article.category)}>{article.categoryInfo.name}</Link>
          </li>
        </ol>
      </nav>

      <Kicker article={article} />
      <h1 className="fn-headline">{article.title}</h1>
      <p className="fn-dek">{article.summary}</p>

      <div className="fn-byline">
        <div className="fn-byline-who">
          <span className="fn-avatar" aria-hidden="true">
            {initials(article.author.name)}
          </span>
          <div>
            <p className="fn-byline-name">
              By{" "}
              <Link href="/about">{article.author.name}</Link>
            </p>
            <p className="fn-byline-dates">
              <time dateTime={article.publishedAt}>
                {draft ? "Not yet published" : `Published ${article.displayDate}`}
              </time>
              {article.displayUpdated && (
                <>
                  <span aria-hidden="true"> · </span>
                  <time dateTime={article.updatedAt}>Updated {article.displayUpdated}</time>
                </>
              )}
              <span aria-hidden="true"> · </span>
              {article.readTimeLabel}
            </p>
          </div>
        </div>
        <ShareLinks url={article.url} title={article.title} />
      </div>
    </header>
  );
}

export function ArticleHero({ article }: { article: Article }) {
  const hero = article.hero;
  if (!hero) return null;
  return (
    <figure className="fn-hero">
      <div className="fn-hero-frame">
        <Image
          src={hero.src}
          alt={hero.alt}
          fill
          priority
          sizes="(max-width: 1120px) 100vw, 1072px"
          className="object-cover"
        />
      </div>
      {(hero.caption || hero.credit) && (
        <figcaption>
          {hero.caption && <span>{hero.caption}</span>}
          {hero.credit && <span className="fn-credit">{hero.credit}</span>}
        </figcaption>
      )}
    </figure>
  );
}

/** Citation markers for a list of source ids, numbered like the body. */
function SourceRefs({ ids, order }: { ids: string[]; order: string[] }) {
  return (
    <>
      {ids.map((id) => {
        const n = order.indexOf(id) + 1;
        return (
          <a key={id} href={`#source-${id}`} className="fn-ref" aria-label={`Source ${n}`}>
            [{n}]
          </a>
        );
      })}
    </>
  );
}

export function SpecsTable({ article }: { article: Article }) {
  const specs = article.specs ?? [];
  if (specs.length === 0) return null;
  const order = (article.sources ?? []).map((s) => s.id);
  const reported = specs.some((s) => !s.verified);
  return (
    <section className="fn-panel" aria-labelledby="fn-specs">
      <div className="fn-panel-head">
        <h2 id="fn-specs">Key specifications</h2>
        {reported && <span className="fn-tag-warn">Includes reported figures</span>}
      </div>
      <div className="fn-table-scroll" role="region" aria-label="Specifications table, scrolls sideways" tabIndex={0}>
        <table className="fn-table">
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">Value</th>
              <th scope="col">Status</th>
              <th scope="col">Source</th>
            </tr>
          </thead>
          <tbody>
            {specs.map((s) => (
              <tr key={s.label}>
                <th scope="row">{s.label}</th>
                <td>
                  {s.value}
                  {s.note && <span className="fn-cell-note">{s.note}</span>}
                </td>
                <td>
                  <span className={s.verified ? "fn-status ok" : "fn-status warn"}>
                    {s.verified ? "Verified" : "Reported"}
                  </span>
                </td>
                <td className="fn-refs">
                  <SourceRefs ids={s.sourceIds} order={order} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {reported && (
        <p className="fn-panel-foot">
          Reported figures come from the listed sources and have not been independently verified by
          Tomorrow’s Tech AI.
        </p>
      )}
    </section>
  );
}

export function Discrepancies({ article }: { article: Article }) {
  const items = article.discrepancies ?? [];
  if (items.length === 0) return null;
  const order = (article.sources ?? []).map((s) => s.id);
  return (
    <section className="fn-panel fn-panel-warn" aria-labelledby="fn-disagree">
      <div className="fn-panel-head">
        <h2 id="fn-disagree">Where sources disagree</h2>
      </div>
      <div className="fn-disagree">
        {items.map((d) => (
          <div key={d.topic} className="fn-disagree-item">
            <h3>{d.topic}</h3>
            <ul>
              {d.accounts.map((acc, i) => (
                <li key={i}>
                  <SourceRefs ids={[acc.sourceId]} order={order} /> {acc.claim}
                </li>
              ))}
            </ul>
            <p className="fn-resolution">
              <b>{d.resolution ? "Our read: " : "Status: "}</b>
              {d.resolution ?? "Unresolved. We report both accounts until the builder or a test settles it."}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function SourcesList({ article }: { article: Article }) {
  const sources = article.sources ?? [];
  if (sources.length === 0) return null;
  const KIND: Record<string, string> = {
    primary: "Primary",
    secondary: "Coverage",
    vendor: "Vendor documentation",
    dataset: "Data",
    other: "Other",
  };
  return (
    <section className="fn-sources" aria-labelledby="fn-sources">
      <h2 id="fn-sources">Sources</h2>
      <ol>
        {sources.map((s) => (
          <li key={s.id} id={`source-${s.id}`}>
            <span className="fn-source-title">
              {s.url ? (
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.title}
                </a>
              ) : (
                s.title
              )}
            </span>
            <span className="fn-source-meta">
              {[s.author, s.publisher, s.publishedAt && formatDate(s.publishedAt)].filter(Boolean).join(" · ")}
              {s.accessedAt && ` · accessed ${formatDate(s.accessedAt)}`}
              <span className="fn-source-kind">{KIND[s.kind] ?? s.kind}</span>
            </span>
            {s.note && <span className="fn-source-note">{s.note}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function InlineCta({ article }: { article: Article }) {
  const cta = ctaFor(article);
  return (
    <aside className="fn-inline-cta" aria-label="From Tomorrow’s Tech AI">
      <p>
        <b>{cta.label}.</b> {cta.blurb}
      </p>
      <Link href={contactHref(article, "inline")}>Talk to us →</Link>
    </aside>
  );
}

export function RailCta({ article }: { article: Article }) {
  const cta = ctaFor(article);
  return (
    <div className="fn-rail-cta">
      <Kicker article={article} />
      <p className="fn-rail-cta-title">{cta.label}</p>
      <p className="fn-rail-cta-body">{cta.blurb}</p>
      <Link href={contactHref(article, "rail")}>Book a discovery call →</Link>
    </div>
  );
}

export function ArticleFooterMeta({ article }: { article: Article }) {
  return (
    <div className="fn-meta-foot">
      {article.tags.length > 0 && (
        <p>
          <span className="fn-meta-label">Topics</span>
          {article.tags.join(" · ")}
        </p>
      )}
      <p>
        <span className="fn-meta-label">Filed under</span>
        {article.categoryInfo.name}
        {article.secondaryCategories?.length
          ? ` · ${article.secondaryCategories.map((c) => getCategory(c).name).join(" · ")}`
          : ""}
      </p>
      {article.displayUpdated && (
        <p>
          <span className="fn-meta-label">Last updated</span>
          {article.displayUpdated}
        </p>
      )}
    </div>
  );
}

export function AuthorCard({ article }: { article: Article }) {
  // John's existing author text is unchanged pending the biography review.
  if (article.author.id === "john-hockinson") {
    return (
      <section className="fn-author" aria-label="About the author">
        <span className="fn-avatar fn-avatar-lg" aria-hidden="true">
          JH
        </span>
        <div>
          <p className="fn-meta-label">About the author</p>
          <p className="fn-author-name">John Hockinson</p>
          <p className="fn-author-bio">
            Founder of Tomorrow’s Tech AI. 18 years inside telecom and
            infrastructure programs — now building business operating
            platforms, AI command centers, and operations systems for businesses still
            running on spreadsheets and email chains.
          </p>
          <Link href="/about" className="fn-author-link">
            More about John →
          </Link>
        </div>
      </section>
    );
  }
  return (
    <section className="fn-author" aria-label="About the author">
      <span className="fn-avatar fn-avatar-lg" aria-hidden="true">
        {initials(article.author.name)}
      </span>
      <div>
        <p className="fn-meta-label">Published by</p>
        <p className="fn-author-name">{article.author.name}</p>
        {article.author.bio && <p className="fn-author-bio">{article.author.bio}</p>}
        <Link href="/about" className="fn-author-link">
          About Tomorrow’s Tech AI →
        </Link>
      </div>
    </section>
  );
}

export function EndCta({ article }: { article: Article }) {
  const cta = ctaFor(article);
  return (
    <section className="fn-end-cta" aria-labelledby="fn-end-cta">
      <div>
        <p className="eyebrow">● Build with us</p>
        <h2 id="fn-end-cta">{cta.label}</h2>
        <p>{cta.blurb} 30 minutes, no pitch, real conversation.</p>
      </div>
      <div className="fn-end-cta-actions">
        <Link href={contactHref(article, "end")} className="btn-primary">
          Book a discovery call →
        </Link>
        <Link href="/services" className="fn-text-link">
          See all services
        </Link>
      </div>
    </section>
  );
}

export function RelatedArticles({ items, category }: { items: Article[]; category: string }) {
  if (items.length === 0) return null;
  const sameCategory = items.every((i) => i.categoryInfo.name === category);
  return (
    <section className="fn-related" aria-labelledby="fn-related">
      <div className="fn-related-head">
        <h2 id="fn-related">{sameCategory ? `More in ${category}` : "Keep reading"}</h2>
        <Link href="/blog" className="fn-text-link">
          All Field Notes →
        </Link>
      </div>
      <div className="fn-related-grid">
        {items.map((r) => (
          <Link key={r.slug} href={r.path} className="fn-card">
            {r.hero && (
              <div className="fn-card-media">
                <Image
                  src={r.hero.src}
                  alt={r.hero.alt}
                  fill
                  sizes="(max-width: 768px) 100vw, 340px"
                  className="object-cover"
                />
              </div>
            )}
            <Kicker article={r} />
            <h3>{r.title}</h3>
            <p className="fn-card-meta">
              {r.displayDate} · {r.readTimeLabel}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
