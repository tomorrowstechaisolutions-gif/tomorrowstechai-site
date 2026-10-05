import Image from "next/image";
import { formatDimensions, formatMoney, orderTitle } from "@/lib/stickers/calculations";
import { STICKER_TYPE_LABELS } from "@/lib/stickers/pricing";
import type { ArtworkState, PriceBreakdown, StickerSelection } from "@/lib/stickers/types";
import styles from "./StickerPage.module.css";

type Props = {
  selection: StickerSelection;
  artwork: ArtworkState;
  pricing: PriceBreakdown;
  notes: string;
  saving: boolean;
  cartId: string | null;
  onNotes: (value: string) => void;
  onAddToCart: () => void;
  onSave: () => void;
  onEdit: (target: "options" | "design") => void;
};

const METHOD_LABELS = { upload: "Upload My Design", "design-service": "Have Us Design It", ai: "Create With AI" } as const;

export function OrderReview({ selection, artwork, pricing, notes, saving, cartId, onNotes, onAddToCart, onSave, onEdit }: Props) {
  return (
    <div className={`${styles.panel} ${styles.reviewPanel}`}>
      <div className={styles.summary}>
        <div className={`${styles.previewStage} ${styles.summaryPreview}`}>
          <div className={styles.previewArt}>
            <span className={styles.previewSticker} aria-hidden="true" />
            <Image src={artwork.previewUrl ?? "/brand/mark.png"} alt="Order artwork preview" width={180} height={180} className={styles.previewImage} unoptimized={Boolean(artwork.previewUrl)} />
          </div>
        </div>
        <div className={styles.summaryList}>
          <strong>{orderTitle(selection)}</strong>
          <p>Type: {STICKER_TYPE_LABELS[selection.stickerType]}</p>
          <p>Size: {formatDimensions(selection.width, selection.height)}</p>
          <p>Quantity: {selection.quantity.toLocaleString()}</p>
          <p>Design Method: {METHOD_LABELS[selection.designMethod]}</p>
          <p>Subtotal: {formatMoney(pricing.subtotal)}</p>
          {pricing.designFee ? <p>Design fee: {formatMoney(pricing.designFee)}</p> : null}
          <p><strong>Total: {formatMoney(pricing.total)}</strong></p>
          <div className={styles.buttonRow}><button type="button" className={styles.secondaryButton} onClick={() => onEdit("options")}>Edit Options</button><button type="button" className={styles.secondaryButton} onClick={() => onEdit("design")}>Edit Design</button></div>
        </div>
      </div>
      <div>
        <div className={styles.reviewActions}>
          <label className={styles.field}><span>Production Notes (Optional)</span><textarea className={styles.textarea} value={notes} onChange={(event) => onNotes(event.target.value)} placeholder="Any special requests?" /></label>
          <div>
            <button type="button" disabled={saving} onClick={onAddToCart} className={`${styles.primaryButton} ${styles.fullButton}`}>{saving ? "Saving\u2026" : cartId ? "Proceed to Checkout" : "\u25a1 Add to Cart"}</button>
            <button type="button" onClick={onSave} className={`${styles.secondaryButton} ${styles.fullButton}`}>Save for Later</button>
          </div>
        </div>
        <div className={styles.securityRow}><span>🔒 Secure checkout</span><span>▣ Fast production</span><span>☆ Local &amp; in-house</span></div>
      </div>
    </div>
  );
}
