"use client";

import { useState } from "react";

import {
  PRODUCTS,
  SHIRT_COLORS,
  SHIRT_SIZES,
  colorHex,
  formatUSD,
  type Product,
  type ShirtSize,
} from "./catalog";
import { ShirtArt } from "./ShirtArt";
import { useShop } from "./ShopProvider";

function Card({ product }: { product: Product }) {
  const { add } = useShop();
  const [color, setColor] = useState(product.plate === "navy" ? "navy" : "black");
  const [size, setSize] = useState<ShirtSize>("L");
  const [added, setAdded] = useState(false);

  const handleAdd = () => {
    add(product.id, color, size);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1200);
  };

  const title = [product.name, product.name2].filter(Boolean).join(" ");

  return (
    <article className="ls-card">
      <div className="ls-plate ls-grain" style={{ background: colorHex(color) }}>
        {product.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.image} alt={title} />
        ) : (
          <ShirtArt design={product.id} uid={`grid-${product.id}`} />
        )}
      </div>

      <div className="ls-meta">
        <h3 className="ls-name">
          {product.name}
          {product.name2 && (
            <>
              <br />
              {product.name2}
            </>
          )}
        </h3>
        <p className="ls-price">{formatUSD(product.price)}</p>

        <div className="ls-swatches" role="group" aria-label={`${title} — shirt color`}>
          {SHIRT_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              className="ls-swatch"
              style={{ background: c.hex }}
              aria-pressed={color === c.id}
              aria-label={c.name}
              title={c.name}
              onClick={() => setColor(c.id)}
            />
          ))}
        </div>

        <div className="ls-sizes" role="group" aria-label={`${title} — size`}>
          {SHIRT_SIZES.map((s) => (
            <button
              key={s}
              type="button"
              className="ls-size"
              aria-pressed={size === s}
              onClick={() => setSize(s)}
            >
              {s}
            </button>
          ))}
        </div>

        <button type="button" className="ls-add" data-added={added} onClick={handleAdd}>
          {added ? "Added" : "Add to Cart"}
        </button>
      </div>
    </article>
  );
}

export function ProductGrid() {
  return (
    <div className="ls-grid">
      {PRODUCTS.map((p) => (
        <Card key={p.id} product={p} />
      ))}
    </div>
  );
}
