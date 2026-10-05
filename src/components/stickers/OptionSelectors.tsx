import { STICKER_TYPES, type StickerSelection, type StickerType } from "@/lib/stickers/types";
import { STICKER_TYPE_LABELS } from "@/lib/stickers/pricing";
import styles from "./StickerPage.module.css";

const SIZES = [2, 2.5, 3, 4, 5] as const;
const QUANTITIES = [10, 25, 50, 100, 250, 500] as const;

type Props = {
  selection: StickerSelection;
  customSize: boolean;
  customQuantity: boolean;
  onChange: (next: Partial<StickerSelection>) => void;
  onCustomSize: (active: boolean) => void;
  onCustomQuantity: (active: boolean) => void;
};

export function OptionSelectors({ selection, customSize, customQuantity, onChange, onCustomSize, onCustomQuantity }: Props) {
  return (
    <div className={styles.configColumns}>
      <div className={`${styles.panel} ${styles.panelPad}`}>
        <span className={styles.panelLabel}>Sticker Type</span>
        <div className={styles.optionGrid} role="radiogroup" aria-label="Sticker type">
          {STICKER_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={selection.stickerType === type}
              onClick={() => onChange({ stickerType: type as StickerType })}
              className={`${styles.option} ${styles.typeOption} ${selection.stickerType === type ? styles.selected : ""}`}
            >
              <span className={styles.optionSwatch} aria-hidden="true" />
              <span className={styles.optionText}>{STICKER_TYPE_LABELS[type]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={`${styles.panel} ${styles.panelPad}`}>
        <span className={styles.panelLabel}>Size</span>
        <div className={styles.sizeGrid} role="radiogroup" aria-label="Sticker size">
          {SIZES.map((size) => (
            <button key={size} type="button" role="radio" aria-checked={!customSize && selection.width === size} onClick={() => { onCustomSize(false); onChange({ width: size, height: size }); }} className={`${styles.option} ${!customSize && selection.width === size ? styles.selected : ""}`}>
              <strong>{size}″</strong>
              {size === 2 ? <span className={styles.optionText}>(2 inch)</span> : null}
            </button>
          ))}
          <button type="button" role="radio" aria-checked={customSize} onClick={() => onCustomSize(true)} className={`${styles.option} ${customSize ? styles.selected : ""}`}>Custom Size</button>
        </div>
        {customSize ? (
          <div className={styles.customInputs}>
            <label className={styles.field}><span className="sr-only">Width in inches</span><input className={styles.input} aria-label="Width in inches" type="number" min="0.5" max="24" step="0.25" value={selection.width} onChange={(event) => onChange({ width: Number(event.target.value) || 0.5 })} placeholder="Width" /></label>
            <label className={styles.field}><span className="sr-only">Height in inches</span><input className={styles.input} aria-label="Height in inches" type="number" min="0.5" max="24" step="0.25" value={selection.height} onChange={(event) => onChange({ height: Number(event.target.value) || 0.5 })} placeholder="Height" /></label>
          </div>
        ) : null}

        <div className={styles.subSection}>
          <span className={styles.panelLabel}>Quantity</span>
          <div className={styles.quantityGrid} role="radiogroup" aria-label="Quantity">
            {QUANTITIES.map((quantity) => (
              <button key={quantity} type="button" role="radio" aria-checked={!customQuantity && selection.quantity === quantity} onClick={() => { onCustomQuantity(false); onChange({ quantity }); }} className={`${styles.option} ${!customQuantity && selection.quantity === quantity ? styles.selected : ""}`}><strong>{quantity}</strong></button>
            ))}
            <button type="button" role="radio" aria-checked={customQuantity} onClick={() => onCustomQuantity(true)} className={`${styles.option} ${customQuantity ? styles.selected : ""}`}>Custom</button>
          </div>
          {customQuantity ? <input className={`${styles.input} ${styles.subSection}`} aria-label="Custom quantity" type="number" min="10" max="10000" step="1" value={selection.quantity} onChange={(event) => onChange({ quantity: Math.max(10, Number(event.target.value) || 10) })} /> : null}
        </div>
      </div>
    </div>
  );
}
