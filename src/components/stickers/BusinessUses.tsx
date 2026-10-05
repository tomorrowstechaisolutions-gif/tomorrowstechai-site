import styles from "./StickerPage.module.css";

const USES = [
  ["\u25a6", "Business Branding"], ["\u25c9", "Product Labels"], ["\u25c7", "Packaging"], ["\u25a1", "Giveaways"], ["\u2302", "Storefronts"],
  ["\u25a3", "Vehicles"], ["\u2605", "Events"], ["\u2592", "QR Codes"], ["\u25a4", "Equipment"], ["+", "And More"],
];

export function BusinessUses() {
  return (
    <section className={styles.uses} aria-labelledby="business-uses-title">
      <div className={`${styles.shell} ${styles.usesInner}`}>
        <h2 id="business-uses-title" className={styles.usesTitle}>Perfect for any business</h2>
        <div className={styles.usesGrid}>{USES.map(([icon, label]) => <div key={label} className={styles.useItem}><span className={styles.useIcon} aria-hidden="true">{icon}</span>{label}</div>)}</div>
      </div>
      <div className={`${styles.shell} ${styles.bottomCta}`}>
        <h2 className={styles.bottomTitle}>Custom stickers<br />made easy</h2>
        <p className={styles.bottomCopy}>High-quality custom stickers, printed in-house by Tomorrow&apos;s Tech AI. Upload, design, or create with AI and get professional stickers for your business, products, events, and more.</p>
        <a href="#sticker-configurator" className={styles.primaryButton}>Get Started Today <span aria-hidden="true">→</span></a>
      </div>
    </section>
  );
}
