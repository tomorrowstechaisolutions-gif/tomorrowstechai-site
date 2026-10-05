"use client";

import { useEffect, useMemo, useState } from "react";
import { calculateStickerPrice, formatMoney } from "@/lib/stickers/calculations";
import type { AIStickerResult, ArtworkState, DesignRequest, StickerSelection } from "@/lib/stickers/types";
import { StickerHero } from "./StickerHero";
import { OptionSelectors } from "./OptionSelectors";
import { StickerPricePreview } from "./StickerPricePreview";
import { DesignMethodSelector } from "./DesignMethodSelector";
import { AIStickerStudio } from "./AIStickerStudio";
import { OrderReview } from "./OrderReview";
import { BusinessUses } from "./BusinessUses";
import styles from "./StickerPage.module.css";

const INITIAL_ARTWORK: ArtworkState = { previewUrl: null, originalFile: null, fileName: null, widthPx: null, heightPx: null, source: null };
const INITIAL_REQUEST: DesignRequest = { businessName: "", stickerText: "", industry: "", colors: "", style: "", logo: null, qrCodeUrl: "", instructions: "" };

export function StickerOrderBuilder({ initialNotice = null }: { initialNotice?: string | null }) {
  const [selection, setSelection] = useState<StickerSelection>({ stickerType: "laminated-vinyl", width: 3, height: 3, quantity: 100, designMethod: "upload" });
  const [customSize, setCustomSize] = useState(false);
  const [customQuantity, setCustomQuantity] = useState(false);
  const [artwork, setArtwork] = useState<ArtworkState>(INITIAL_ARTWORK);
  const [designRequest, setDesignRequest] = useState<DesignRequest>(INITIAL_REQUEST);
  const [notes, setNotes] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(initialNotice);
  const [saving, setSaving] = useState(false);
  const [cartId, setCartId] = useState<string | null>(null);
  const pricing = useMemo(() => calculateStickerPrice(selection), [selection]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => () => { if (artwork.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(artwork.previewUrl); }, [artwork.previewUrl]);

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const updateSelection = (next: Partial<StickerSelection>) => { setSelection((current) => ({ ...current, ...next })); setCartId(null); };
  const chooseMethod = (designMethod: StickerSelection["designMethod"]) => updateSelection({ designMethod });
  const useAI = (result: AIStickerResult) => {
    setArtwork({ previewUrl: result.imageUrl, originalFile: null, fileName: "AI generated sticker", widthPx: null, heightPx: null, source: "ai", aiPrompt: result.prompt, aiGenerationId: result.id });
    chooseMethod("ai");
    setAiOpen(false);
    setToast("AI design added to your sticker order.");
    window.setTimeout(() => scrollTo("order-review"), 100);
  };

  const saveOrder = async (intent: "cart" | "save") => {
    if (intent === "cart" && cartId) {
      const response = await fetch("/api/sticker-orders/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: cartId }) });
      const payload = await response.json();
      if (payload.url) window.location.assign(payload.url);
      else setToast(payload.message ?? "Checkout is not connected yet.");
      return;
    }
    if (selection.designMethod === "upload" && !artwork.originalFile) { setToast("Upload your artwork before adding this order to cart."); scrollTo("design-method"); return; }
    if (selection.designMethod === "design-service" && !designRequest.businessName.trim()) { setToast("Add your business name to the design brief first."); scrollTo("design-method"); return; }
    setSaving(true);
    try {
      const form = new FormData();
      form.set("selection", JSON.stringify(selection));
      form.set("designRequest", JSON.stringify({ ...designRequest, logo: undefined }));
      form.set("artwork", JSON.stringify({ fileName: artwork.fileName, previewUrl: artwork.previewUrl?.startsWith("/") ? artwork.previewUrl : null, aiPrompt: artwork.aiPrompt, aiGenerationId: artwork.aiGenerationId }));
      form.set("productionNotes", notes);
      form.set("intent", intent);
      if (artwork.originalFile) form.set("originalArtwork", artwork.originalFile);
      if (designRequest.logo) form.set("designLogo", designRequest.logo);
      const response = await fetch("/api/sticker-orders/draft", { method: "POST", body: form });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "We couldn't save the order.");
      setCartId(payload.order.id);
      if (intent === "cart" && payload.backendMode === "supabase") {
        const checkoutResponse = await fetch("/api/sticker-orders/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: payload.order.id }),
        });
        const checkout = await checkoutResponse.json();
        if (checkout.url) {
          window.location.assign(checkout.url);
          return;
        }
        setToast(checkout.message ?? checkout.error ?? "Checkout could not be started.");
      } else {
        setToast(intent === "cart" ? "Added to preview cart. Connect Supabase and Stripe to accept checkout." : "Draft saved for later.");
      }
    } catch (error) { setToast(error instanceof Error ? error.message : "We couldn't save the order."); }
    finally { setSaving(false); }
  };

  return (
    <div className={styles.page}>
      <StickerHero onOpenAI={() => { setAiOpen(true); chooseMethod("ai"); }} />
      <main className={styles.main}>
        <section id="sticker-configurator" className={`${styles.shell} ${styles.section}`} aria-labelledby="options-heading">
          <SectionHeading number="1" id="options-heading">Choose Your Sticker Options</SectionHeading>
          <div className={styles.configGrid}>
            <OptionSelectors selection={selection} customSize={customSize} customQuantity={customQuantity} onChange={updateSelection} onCustomSize={setCustomSize} onCustomQuantity={setCustomQuantity} />
            <StickerPricePreview selection={selection} pricing={pricing} artwork={artwork} onContinue={() => scrollTo("design-method")} />
          </div>
        </section>

        <section id="design-method" className={`${styles.shell} ${styles.section}`} aria-labelledby="design-heading">
          <SectionHeading number="2" id="design-heading">How Do You Want To Create Your Design?</SectionHeading>
          <DesignMethodSelector method={selection.designMethod} artwork={artwork} designRequest={designRequest} onMethod={chooseMethod} onArtwork={(next) => { setArtwork(next); setCartId(null); }} onDesignRequest={setDesignRequest} onOpenAI={() => setAiOpen(true)} onToast={setToast} />
        </section>

        <section id="order-review" className={`${styles.shell} ${styles.section}`} aria-labelledby="review-heading">
          <div className={styles.sectionHeading}>
            <span className={styles.stepBadge}>3</span><h2 id="review-heading">Review &amp; Add To Cart</h2><div className={styles.headingRule} />
            <div className={styles.progress} aria-label="Order progress"><span>1</span> Options <span>2</span> Design <span>3</span> Review <span>4</span> Checkout</div>
          </div>
          <OrderReview selection={selection} artwork={artwork} pricing={pricing} notes={notes} saving={saving} cartId={cartId} onNotes={setNotes} onAddToCart={() => saveOrder("cart")} onSave={() => saveOrder("save")} onEdit={(target) => scrollTo(target === "options" ? "sticker-configurator" : "design-method")} />
        </section>

        <BusinessUses />
      </main>
      <AIStickerStudio open={aiOpen} onClose={() => setAiOpen(false)} onUse={useAI} onToast={setToast} />
      {toast ? <div className={styles.toast} role="status">{toast}</div> : null}
      <div className={styles.mobileBar}><div className={styles.mobilePrice}><span>{selection.quantity} stickers</span><strong>{formatMoney(pricing.total)}</strong></div><button type="button" className={styles.primaryButton} onClick={() => scrollTo("order-review")}>Review Order</button></div>
    </div>
  );
}

function SectionHeading({ number, id, children }: { number: string; id: string; children: React.ReactNode }) {
  return <div className={styles.sectionHeading}><span className={styles.stepBadge}>{number}</span><h2 id={id}>{children}</h2><span className={styles.headingRule} /></div>;
}
