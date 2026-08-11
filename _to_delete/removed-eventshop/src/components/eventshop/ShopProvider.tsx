"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  PRODUCTS_BY_ID,
  colorHex,
  colorName,
  formatUSD,
  type ShirtSize,
} from "./catalog";
import { ShirtArt } from "./ShirtArt";

const STORAGE_KEY = "ls-cart-v1";

export type CartItem = {
  /** productId|color|size — stable identity for a configured variant. */
  key: string;
  productId: string;
  color: string;
  size: ShirtSize;
  qty: number;
};

type ShopCtx = {
  items: CartItem[];
  count: number;
  subtotal: number;
  add: (productId: string, color: string, size: ShirtSize) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  openCart: () => void;
};

const Ctx = createContext<ShopCtx | null>(null);

export function useShop(): ShopCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useShop must be used inside <ShopProvider>");
  return ctx;
}

function CartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2.5 3h2.2l2.3 11.2a1.6 1.6 0 0 0 1.6 1.3h8.6a1.6 1.6 0 0 0 1.6-1.3L20.5 7H6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9.5" cy="20" r="1.6" fill="currentColor" />
      <circle cx="17.5" cy="20" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function ShopProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Restore a cart the visitor left behind. Runs once, after mount, so the
  // server and first client render agree.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setItems(
            parsed.filter(
              (i): i is CartItem =>
                !!i &&
                typeof i === "object" &&
                typeof (i as CartItem).productId === "string" &&
                PRODUCTS_BY_ID[(i as CartItem).productId] !== undefined
            )
          );
        }
      }
    } catch {
      /* corrupt or unavailable storage is not worth surfacing */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* private mode / quota — the cart just won't persist */
    }
  }, [items, hydrated]);

  // Lock background scroll while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const add = useCallback((productId: string, color: string, size: ShirtSize) => {
    const key = `${productId}|${color}|${size}`;
    setItems((prev) => {
      const found = prev.find((i) => i.key === key);
      if (found) {
        return prev.map((i) => (i.key === key ? { ...i, qty: Math.min(i.qty + 1, 20) } : i));
      }
      return [...prev, { key, productId, color, size, qty: 1 }];
    });
    setError(null);
  }, []);

  const setQty = useCallback((key: string, qty: number) => {
    setItems((prev) =>
      qty <= 0
        ? prev.filter((i) => i.key !== key)
        : prev.map((i) => (i.key === key ? { ...i, qty: Math.min(qty, 20) } : i))
    );
  }, []);

  const remove = useCallback((key: string) => {
    setItems((prev) => prev.filter((i) => i.key !== key));
  }, []);

  const count = useMemo(() => items.reduce((n, i) => n + i.qty, 0), [items]);

  const subtotal = useMemo(
    () =>
      items.reduce(
        (n, i) => n + (PRODUCTS_BY_ID[i.productId]?.price ?? 0) * i.qty,
        0
      ),
    [items]
  );

  const checkout = useCallback(async () => {
    if (!items.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/eventshop/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map(({ productId, color, size, qty }) => ({
            productId,
            color,
            size,
            qty,
          })),
        }),
      });
      const data: { url?: string; error?: string } = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error || "Checkout is unavailable right now. Please try again.");
        setBusy(false);
        return;
      }
      window.location.assign(data.url);
    } catch {
      setError("Could not reach checkout. Check your connection and try again.");
      setBusy(false);
    }
  }, [items, busy]);

  const value = useMemo<ShopCtx>(
    () => ({ items, count, subtotal, add, setQty, remove, openCart: () => setOpen(true) }),
    [items, count, subtotal, add, setQty, remove]
  );

  return (
    <Ctx.Provider value={value}>
      <header className="ls-header">
        <div className="ls-shell ls-header-in">
          <a className="ls-logo" href="#top">
            <span className="ls-logo-1">
              LONE
              <svg width="11" height="11" viewBox="-1 -1 2 2" aria-hidden="true">
                <path
                  d="M0 -1 L0.2245 -0.309 L0.951 -0.309 L0.3633 0.1181 L0.588 0.809 L0 0.382 L-0.588 0.809 L-0.3633 0.1181 L-0.951 -0.309 L-0.2245 -0.309 Z"
                  fill="currentColor"
                />
              </svg>
              STAR
            </span>
            <span className="ls-logo-2">LOUD</span>
            <span className="ls-logo-3">Proudly Texan.</span>
          </a>

          <nav className="ls-nav" aria-label="Shop">
            <a href="#shop" data-active="true">
              Shop
            </a>
            <a href="#about">About</a>
          </nav>

          <button
            type="button"
            className="ls-cart-btn"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
          >
            <CartIcon />
            <span>Cart</span>
            <span className="ls-badge" aria-label={`${count} items in cart`}>
              {count}
            </span>
          </button>
        </div>
      </header>

      {children}

      {open && (
        <>
          <button
            type="button"
            className="ls-overlay"
            aria-label="Close cart"
            onClick={() => setOpen(false)}
          />
          <aside className="ls-drawer" role="dialog" aria-modal="true" aria-label="Your cart">
            <div className="ls-drawer-head">
              <h2>Your Cart</h2>
              <button type="button" className="ls-x" onClick={() => setOpen(false)} aria-label="Close cart">
                &times;
              </button>
            </div>

            <div className="ls-drawer-body">
              {items.length === 0 ? (
                <p className="ls-empty">Nothing in the cart yet. Pick your message.</p>
              ) : (
                items.map((item) => {
                  const p = PRODUCTS_BY_ID[item.productId];
                  if (!p) return null;
                  return (
                    <div className="ls-line" key={item.key}>
                      <div
                        className="ls-line-art"
                        style={{ background: colorHex(item.color) }}
                      >
                        {p.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.image} alt="" />
                        ) : (
                          <ShirtArt design={p.id} uid={`cart-${item.key.replace(/\|/g, "-")}`} />
                        )}
                      </div>
                      <div className="ls-line-info">
                        <div className="ls-line-name">
                          {[p.name, p.name2].filter(Boolean).join(" ")}
                        </div>
                        <div className="ls-line-var">
                          {colorName(item.color)} / {item.size}
                        </div>
                        <div className="ls-qty">
                          <button
                            type="button"
                            onClick={() => setQty(item.key, item.qty - 1)}
                            aria-label="Decrease quantity"
                          >
                            &minus;
                          </button>
                          <span>{item.qty}</span>
                          <button
                            type="button"
                            onClick={() => setQty(item.key, item.qty + 1)}
                            aria-label="Increase quantity"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="ls-line-remove"
                            onClick={() => remove(item.key)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                      <div className="ls-line-price">{formatUSD(p.price * item.qty)}</div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="ls-drawer-foot">
              {error && <p className="ls-error">{error}</p>}
              <dl className="ls-total">
                <dt>Subtotal</dt>
                <dd>{formatUSD(subtotal)}</dd>
              </dl>
              <p className="ls-note">Shipping and tax calculated at checkout.</p>
              <button
                type="button"
                className="ls-btn"
                style={{ width: "100%", marginTop: 0 }}
                onClick={checkout}
                disabled={items.length === 0 || busy}
              >
                {busy ? "Redirecting..." : "Secure Checkout"}
              </button>
            </div>
          </aside>
        </>
      )}
    </Ctx.Provider>
  );
}
