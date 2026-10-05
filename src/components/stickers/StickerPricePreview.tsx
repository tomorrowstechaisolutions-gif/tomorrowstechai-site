import Image from "next/image";
import { formatMoney, orderTitle } from "@/lib/stickers/calculations";
import { getPrintWarnings } from "@/lib/stickers/validation";
import type { ArtworkState, PriceBreakdown, StickerSelection } from "@/lib/stickers/types";
import styles from "./StickerPage.module.css";

type Props = { selection: StickerSelection; pricing: PriceBreakdown; artwork: ArtworkState; onContinue: () => void };

export function StickerPricePreview({ selection, pricing, artwork, onContinue }: Props) {
  const warnings = getPrintWarnings(artwork, selection);
  return (
    <aside className={`${styles.panel} ${styles.previewCard}`} aria-live="polite">
      <span className={styles.panelLabel}>Live Preview &amp; Price</span>
      <div className={styles.previewStage}>
        <div className={styles.previewArt}>
          <span className={styles.previewSticker} aria-hidden="true" />
          <Image className={artwork.previewUrl ? styles.previewImage : styles.placeholderMark} src={artwork.previewUrl ?? "/brand/mark.png"} alt={artwork.fileName ? `Preview of ${artwork.fileName}` : "Tomorrow's Tech AI sample sticker artwork"} fill={false} width={320} height={320} loading="eager" unoptimized={Boolean(artwork.previewUrl?.startsWith("blob:"))} />
        </div>
      </div>
      <h3 className={styles.previewTitle}>{orderTitle(selection)}</h3>
      <p className={styles.priceMeta}>Quantity: {selection.quantity.toLocaleString()}</p>
      <p className={styles.price}>{formatMoney(pricing.total)}</p>
      <p className={styles.priceMeta}>Estimated price per sticker: {formatMoney((pricing.subtotal / selection.quantity))}</p>
      {warnings.slice(0, artwork.previewUrl ? 2 : 1).map((warning) => <p key={warning} className={styles.warning}><span aria-hidden="true">!</span>{warning}</p>)}
      <button type="button" onClick={onContinue} className={`${styles.primaryButton} ${styles.fullButton}`}>Continue to design <span aria-hidden="true">→</span></button>
    </aside>
  );
}
