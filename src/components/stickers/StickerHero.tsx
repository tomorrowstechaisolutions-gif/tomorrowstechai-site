import styles from "./StickerPage.module.css";

const FEATURES = [
  ["\u25c8", "Full Color Printing"],
  ["\u25c7", "Durable & Weather Resistant"],
  ["\u2605", "Any Size / Any Shape"],
  ["\u26a1", "Low Quantities"],
  ["\u25a3", "Fast Turnaround"],
  ["\u2699", "Designed & Printed In-House"],
];

export function StickerHero({ onOpenAI }: { onOpenAI: () => void }) {
  return (
    <section className={styles.hero} aria-labelledby="sticker-hero-title">
      <div className={styles.heroInner}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Custom stickers for businesses</p>
          <h1 id="sticker-hero-title" className={styles.heroTitle}>
            Custom<br />Business<br /><span>Stickers</span>
          </h1>
          <p className={styles.heroSub}>
            Turn your logo, idea, QR code, or brand into high-quality custom stickers.
          </p>
          <div className={styles.featureRow} aria-label="Sticker service benefits">
            {FEATURES.map(([icon, label]) => (
              <div key={label} className={styles.feature}>
                <span className={styles.featureIcon} aria-hidden="true">{icon}</span>
                {label}
              </div>
            ))}
          </div>
          <div className={styles.buttonRow}>
            <a href="#sticker-configurator" className={styles.primaryButton}>Start your sticker order <span aria-hidden="true">→</span></a>
            <button type="button" onClick={onOpenAI} className={styles.secondaryButton}>✦ Create with AI</button>
          </div>
          <p className={styles.heroNote}>Upload your design, have us design it, or create one with our AI Sticker Studio.</p>
        </div>
      </div>
    </section>
  );
}
