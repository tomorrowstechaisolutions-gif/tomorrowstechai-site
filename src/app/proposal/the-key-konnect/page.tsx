import type { Metadata } from "next";
import { BrandMark } from "@/components/BrandMark";

export const metadata: Metadata = {
  title: "Website Proposal for The Key Konnect",
  description: "A website launch proposal prepared for Cory Simek and The Key Konnect.",
  robots: { index: false, follow: false },
};

const scope = [
  { number: "01", title: "4–5 page brand website", body: "A professional mobile-first website shaped around The Key Konnect, its vehicles, merchandise, and music." },
  { number: "02", title: "Working vehicle inventory", body: "Vehicle listings with photos, essential details, availability or pricing, and a clear customer inquiry path." },
  { number: "03", title: "Merchandise shop", body: "An initial storefront for Cory’s merchandise using the products, photos, prices, and fulfillment information he provides." },
  { number: "04", title: "Music experience", body: "A dedicated music section built around “13 Years Old” and the approved audio, artwork, links, and media Cory supplies." },
  { number: "05", title: "Lead capture and starter CRM", body: "Customer inquiries collected into one organized place so opportunities can be reviewed and followed up." },
  { number: "06", title: "Launch foundation", body: "Mobile optimization, contact setup, SSL, domain connection, basic analytics, and technical search setup." },
];

const needed = [
  "The “13 Years Old” MP3 and confirmation Cory has the rights to publish it",
  "Company logo and preferred brand assets",
  "Vehicle photos, descriptions, prices, and availability",
  "Initial merchandise photos, names, prices, and fulfillment details",
  "Contact information, social links, and final preview feedback",
];

export default function KeyKonnectProposalPage() {
  return (
    <div className="client-proposal">
      <header className="client-proposal-nav">
        <a href="https://tomorrowstechai.com" className="client-proposal-brand">
          <BrandMark size={36} />
          <span>TOMORROW’S <b>TECH AI</b></span>
        </a>
        <span>Prepared September 1, 2026</span>
      </header>

      <main>
        <section className="client-proposal-hero">
          <div>
            <span className="client-proposal-kicker">Website launch proposal · TTAI–001</span>
            <h1>A digital home for<br /><em>The Key Konnect.</em></h1>
            <p>Prepared for Cory Simek, owner and visionary behind The Key Konnect.</p>
          </div>
          <aside>
            <span>Project investment</span>
            <strong>$399</strong>
            <p>one-time website build</p>
            <div><b>$29/month</b> hosting &amp; management</div>
          </aside>
        </section>

        <section className="client-proposal-intro">
          <span>THE VISION</span>
          <div>
            <h2>Vehicles working. Merch ready to sell. Music front and center.</h2>
            <p>The goal is one polished website that introduces The Key Konnect, gives customers a clear way to explore vehicles and merchandise, and creates a real home for Cory’s music and brand.</p>
          </div>
        </section>

        <section className="client-proposal-scope">
          <div className="client-proposal-section-head"><span>01</span><h2>What we’re building</h2><p>Agreed project scope</p></div>
          <div className="client-proposal-scope-grid">
            {scope.map((item) => <article key={item.number}><span>{item.number}</span><h3>{item.title}</h3><p>{item.body}</p></article>)}
          </div>
        </section>

        <section className="client-proposal-split">
          <div>
            <div className="client-proposal-section-head"><span>02</span><h2>Investment</h2></div>
            <div className="client-proposal-price"><div><span>Website design &amp; build</span><strong>$399</strong><small>one time</small></div><div><span>Hosting &amp; management</span><strong>$29</strong><small>per month</small></div></div>
            <p className="client-proposal-fine">The recurring hosting covers managed hosting, SSL, backups, security updates, and small content changes. New features or major additions are scoped separately before work begins.</p>
          </div>
          <div>
            <div className="client-proposal-section-head"><span>03</span><h2>What we need from Cory</h2></div>
            <ul className="client-proposal-needed">{needed.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        </section>

        <section className="client-proposal-next">
          <span>THE NEXT MOVE</span>
          <h2>Approve the direction. Send the assets. We finish the build.</h2>
          <p>The working preview is already underway. Once the listed content is received, Tomorrow’s Tech AI can complete the agreed pages and features for final review.</p>
          <div><a href="mailto:john@tomorrowstechai.com?subject=The%20Key%20Konnect%20website%20proposal">Reply about this proposal</a><a className="secondary" href="https://corywiththekeys.vercel.app/" target="_blank" rel="noreferrer">View working preview</a></div>
        </section>

        <footer className="client-proposal-footer"><span>Tomorrow’s Tech AI · Solutions for tomorrow. Results today.</span><span>john@tomorrowstechai.com</span></footer>
      </main>
    </div>
  );
}
