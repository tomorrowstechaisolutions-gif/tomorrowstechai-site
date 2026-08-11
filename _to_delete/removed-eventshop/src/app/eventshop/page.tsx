import { HeroFlag, TexasMap } from "@/components/eventshop/ShirtArt";
import { ProductGrid } from "@/components/eventshop/ProductGrid";
import { SceneCell } from "@/components/eventshop/Scenes";
import { ShopProvider } from "@/components/eventshop/ShopProvider";

const RED = "#b31f2b";
const BLUE = "#1c3f6e";

function StarGlyph({ size = 14, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="-1.1 -1.1 2.2 2.2" aria-hidden="true">
      <path
        d="M0 -1 L0.2245 -0.309 L0.951 -0.309 L0.3633 0.1181 L0.588 0.809 L0 0.382 L-0.588 0.809 L-0.3633 0.1181 L-0.951 -0.309 L-0.2245 -0.309 Z"
        fill={color}
      />
    </svg>
  );
}

/* ------------------------------------------------------------- icons ----- */

const TEXAS_D =
  "M27.5 0 L50.4 0 L50.4 18.1 L56.5 18.1 L65.6 22.4 L71.8 24.3 L81 26.2 L86.3 24.3 L96.2 27.6 L96.2 43 L100 60.7 L90.8 63.6 L86.3 71 L74.8 78.5 L70.2 86 L71.8 97.2 L61.8 94.4 L54.2 84.1 L45 70.1 L39.7 62.6 L32.1 62.6 L27.5 70.1 L16 63.6 L12.2 54.2 L0.8 43.9 L0 42.1 L27.5 42.1 Z";

function IconTexas() {
  return (
    <svg viewBox="-2 -2 104 102" aria-hidden="true">
      <path d={TEXAS_D} fill={RED} />
    </svg>
  );
}

function IconTee() {
  return (
    <svg viewBox="0 0 200 200" aria-hidden="true">
      <path
        d="M42 34 L76 16 C84 36 116 36 124 16 L158 34 L176 70 L150 84 L147 186 L53 186 L50 84 L24 70 Z"
        fill={BLUE}
      />
    </svg>
  );
}

function IconTruck() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <rect x="4" y="30" width="52" height="38" rx="3" fill={RED} />
      <path d="M56 42 H76 L92 56 V68 H56 Z" fill={RED} />
      <circle cx="28" cy="74" r="9" fill={RED} />
      <circle cx="76" cy="74" r="9" fill={RED} />
      <circle cx="28" cy="74" r="3.5" fill="#efe9dc" />
      <circle cx="76" cy="74" r="3.5" fill="#efe9dc" />
      <path d="M0 38 H14 M0 50 H10" stroke={RED} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <rect x="10" y="18" width="80" height="72" rx="4" fill={BLUE} />
      <rect x="10" y="18" width="80" height="18" fill="#12304f" />
      <rect x="26" y="10" width="8" height="16" rx="3" fill="#12304f" />
      <rect x="66" y="10" width="8" height="16" rx="3" fill="#12304f" />
      <g fill="#efe9dc">
        {[0, 1, 2, 3].map((r) =>
          [0, 1, 2, 3, 4].map((c) => (
            <rect key={`${r}-${c}`} x={20 + c * 13} y={44 + r * 11} width="8" height="7" rx="1" />
          ))
        )}
      </g>
    </svg>
  );
}

function IconShield() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <path d="M50 6 L88 20 V50 C88 74 70 88 50 96 C30 88 12 74 12 50 V20 Z" fill="#cfd6e2" />
      <path d="M34 50 L46 62 L68 38" stroke="#101733" strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconBadge() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="40" r="30" fill="#e0d7bf" />
      <circle cx="50" cy="40" r="22" fill="none" stroke="#a8996f" strokeWidth="3" />
      <path d="M34 66 L26 96 L50 84 L74 96 L66 66 Z" fill="#b31f2b" />
      <g transform="translate(50 40) scale(11)">
        <path
          d="M0 -1 L0.2245 -0.309 L0.951 -0.309 L0.3633 0.1181 L0.588 0.809 L0 0.382 L-0.588 0.809 L-0.3633 0.1181 L-0.951 -0.309 L-0.2245 -0.309 Z"
          fill="#8a7c52"
        />
      </g>
    </svg>
  );
}

function IconFlagUS() {
  return (
    <svg viewBox="0 0 100 70" aria-hidden="true">
      <rect width="100" height="70" fill="#efe9dc" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={i} y={i * 12} width="100" height="6" fill="#b31f2b" />
      ))}
      <rect width="44" height="38" fill="#1c3f6e" />
      <g fill="#efe9dc">
        {Array.from({ length: 12 }, (_, i) => (
          <circle key={i} cx={6 + (i % 4) * 11} cy={7 + Math.floor(i / 4) * 11} r="2.2" />
        ))}
      </g>
    </svg>
  );
}

function IconChat() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <path d="M8 16 H92 V70 H40 L20 88 V70 H8 Z" fill="#dfe4ee" />
      <g fill="#101733">
        <circle cx="34" cy="44" r="6" />
        <circle cx="50" cy="44" r="6" />
        <circle cx="66" cy="44" r="6" />
      </g>
    </svg>
  );
}

/* -------------------------------------------------------------- data ----- */

const TRUST = [
  {
    icon: <IconTexas />,
    title: "Texas Proud",
    body: "Designed in Texas by Texans.",
  },
  {
    icon: <IconTee />,
    title: "Premium Quality",
    body: "Soft, durable shirts built to last.",
  },
  {
    icon: <IconTruck />,
    title: "Printed To Order",
    body: "Made just for you. No waste.",
  },
  {
    icon: <IconCalendar />,
    title: "Limited Run",
    body: "Available now through Election Day only.",
  },
];

const GUARANTEE = [
  {
    icon: <IconShield />,
    title: "Secure Checkout",
    body: "Your information is always protected.",
  },
  {
    icon: <IconBadge />,
    title: "Satisfaction Guarantee",
    body: "Love it or we'll make it right.",
  },
  {
    icon: <IconFlagUS />,
    title: "Fast U.S. Shipping",
    body: "Orders ship in 3–5 business days.",
  },
  {
    icon: <IconChat />,
    title: "Support Texas Small",
    body: "Every order supports a Texas small business.",
  },
];

/* -------------------------------------------------------------- page ----- */

export default function EventShopPage() {
  return (
    <ShopProvider>
      {/* ------------------------------------------------------------ hero */}
      <section className="ls-hero">
        <div className="ls-hero-copy">
          <h1 className="ls-display">
            <span className="l1">Texas has spoken.</span>
            <span className="l2">Now wear it.</span>
          </h1>

          <div className="ls-rule">
            <StarGlyph size={16} />
          </div>

          <p>Limited-run Texas political shirts available through Election Day.</p>

          <a className="ls-btn" href="#shop">
            <StarGlyph size={13} color="#f4efe4" />
            Shop the Drop
            <StarGlyph size={13} color="#f4efe4" />
          </a>
        </div>

        <div className="ls-hero-flag">
          <HeroFlag />
        </div>
      </section>

      {/* --------------------------------------------------------- product */}
      <section id="shop">
        <div className="ls-shell">
          <div className="ls-sect-head">
            <h2>
              <span className="ls-star">
                <StarGlyph size={17} />
              </span>
              Pick your message.
              <span className="ls-star">
                <StarGlyph size={17} />
              </span>
            </h2>
          </div>
          <ProductGrid />
        </div>
      </section>

      {/* ----------------------------------------------------------- trust */}
      <section className="ls-trust" id="about">
        <div className="ls-shell ls-trust-in">
          {TRUST.map((t) => (
            <div className="ls-trust-item" key={t.title}>
              {t.icon}
              <div>
                <h3>{t.title}</h3>
                <p>{t.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------- lifestyle */}
      <section className="ls-life" aria-label="Shirts in the wild">
        <SceneCell
          kind="ranch"
          design="dont-dan"
          shirt="#141418"
          alt="Don't Dan My Texas tee at a Texas ranch"
        />
        <SceneCell
          kind="field"
          design="stars-at-night"
          shirt="#16161b"
          alt="The Stars At Night tee in a bluebonnet field"
        />
        <SceneCell
          kind="city"
          design="lone-star-no-dan"
          shirt="#121216"
          alt="Lone Star. No Dan. tee against a Texas skyline"
        />
      </section>

      {/* --------------------------------------------------------- closing */}
      <section className="ls-closing">
        <div className="ls-shell ls-closing-in">
          <div>
            <h2>
              Pick your message.
              <span className="em">
                <span className="ls-inline-star">
                  <StarGlyph size={18} color="#cf2734" />
                </span>{" "}
                Wear your vote.{" "}
                <span className="ls-inline-star">
                  <StarGlyph size={18} color="#cf2734" />
                </span>
              </span>
            </h2>
            <a className="ls-btn" href="#shop">
              Shop All Shirts &rarr;
            </a>
          </div>
          <div className="ls-closing-map">
            <TexasMap uid="ls-closing-map" />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- guarantee */}
      <section className="ls-guarantee">
        <div className="ls-shell ls-guarantee-in">
          {GUARANTEE.map((g) => (
            <div className="ls-guarantee-item" key={g.title}>
              {g.icon}
              <div>
                <h3>{g.title}</h3>
                <p>{g.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------- footer */}
      <footer className="ls-footer">
        <div className="ls-shell ls-footer-in">
          <div className="ls-fcol">
            <a className="ls-logo" href="#top">
              <span className="ls-logo-1">
                LONE
                <StarGlyph size={11} />
                STAR
              </span>
              <span className="ls-logo-2">LOUD</span>
              <span className="ls-logo-3">Proudly Texan.</span>
            </a>
          </div>

          <div className="ls-fcol">
            <h4>Shop</h4>
            <ul>
              <li>
                <a href="#shop">All Shirts</a>
              </li>
              <li>
                <span>Size Guide</span>
              </li>
              <li>
                <span>Shipping &amp; Returns</span>
              </li>
              <li>
                <span>FAQs</span>
              </li>
            </ul>
          </div>

          <div className="ls-fcol">
            <h4>Store</h4>
            <ul>
              <li>
                <a href="#about">About Us</a>
              </li>
              <li>
                <span>Contact</span>
              </li>
              <li>
                <span>Track My Order</span>
              </li>
            </ul>
          </div>

          <div className="ls-fcol">
            <h4>Legal</h4>
            <ul>
              <li>
                <a href="/privacy">Privacy Policy</a>
              </li>
              <li>
                <a href="/terms">Terms of Service</a>
              </li>
              <li>
                <span>Refund Policy</span>
              </li>
            </ul>
          </div>

          <div className="ls-fcol">
            <div className="ls-social" aria-hidden="true">
              <span>f</span>
              <span>ig</span>
              <span>X</span>
            </div>
            <p className="ls-disclaimer">
              This site and its products are not authorized by or affiliated with any
              candidate, campaign, political party, or government entity.
            </p>
          </div>
        </div>
      </footer>
    </ShopProvider>
  );
}
