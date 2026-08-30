import { createSupabaseServerClient } from "@/lib/supabase/server";
import { REVENUE_CATEGORIES, BILLING_PERIODS, type CatalogItem } from "@/lib/supabase/types";
import { fmtMoney } from "@/lib/campaign/metrics";
import { saveCatalogItem, retireCatalogItem, restoreCatalogItem } from "../../actions";

export const dynamic = "force-dynamic";

const CATEGORY_LABEL: Record<string, string> = {
  launch_package: "Launch package",
  hosting: "Hosting",
  crm: "CRM",
  ai_automation: "AI & automation",
  custom_app: "Custom app",
  ecommerce: "E-commerce",
  dashboard: "Dashboard",
  social: "Social",
  marketing: "Marketing",
  development: "Development",
  other: "Other",
};

function ItemForm({ item }: { item?: CatalogItem }) {
  return (
    <form action={saveCatalogItem} className="ad-form">
      {item && <input type="hidden" name="id" value={item.id} />}
      <label className="ad-field">
        <span>Name</span>
        <input name="name" defaultValue={item?.name ?? ""} className="ad-input" required />
      </label>
      <label className="ad-field">
        <span>Category</span>
        <select name="category" defaultValue={item?.category ?? "other"} className="ad-input">
          {REVENUE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c] ?? c}
            </option>
          ))}
        </select>
      </label>
      <label className="ad-field">
        <span>Billing</span>
        <select name="billing" defaultValue={item?.billing ?? "one_time"} className="ad-input">
          {BILLING_PERIODS.map((b) => (
            <option key={b} value={b}>
              {b === "monthly" ? "Monthly retainer" : "One-time"}
            </option>
          ))}
        </select>
      </label>
      <label className="ad-field">
        <span>Reference price (&ldquo;from&rdquo;)</span>
        <input
          name="from_price"
          defaultValue={item ? (item.from_cents / 100).toFixed(2) : ""}
          className="ad-input"
          placeholder="1500"
        />
      </label>
      <label className="ad-field">
        <span>What it is</span>
        <textarea
          name="description"
          defaultValue={item?.description ?? ""}
          className="ad-input"
          rows={2}
        />
      </label>
      <label className="ad-field">
        <span>Order</span>
        <input
          name="position"
          defaultValue={String(item?.position ?? 0)}
          className="ad-input"
        />
      </label>
      <label className="ad-check-row">
        <input type="checkbox" name="active" defaultChecked={item ? item.active : true} />
        <span>Available to sell</span>
      </label>
      <button type="submit" className="ad-btn primary sm">
        {item ? "Save" : "Add to catalog"}
      </button>
    </form>
  );
}

export default async function CatalogPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("catalog_items")
    .select("*")
    .order("position", { ascending: true });

  const items = (data ?? []) as CatalogItem[];
  const live = items.filter((i) => i.active);
  const retired = items.filter((i) => !i.active);

  return (
    <>
      <header className="ad-head">
        <h1>Catalog</h1>
        <p>
          Everything you sell on top of the $399 package. Prices here are a
          starting point you can see while quoting &mdash; the amount actually
          charged is typed when you send the link, so nothing here can reprice a
          quote that&rsquo;s already out.
        </p>
      </header>

      <div className="ad-grid-2">
        <div>
          <section className="ad-panel">
            <h2 className="ad-panel-title">{live.length} available</h2>
            <div className="ad-table-scroll">
              <table className="ad-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Category</th>
                    <th>Billing</th>
                    <th>From</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {live.map((i) => (
                    <tr key={i.id}>
                      <td>
                        <strong>{i.name}</strong>
                        {i.description && (
                          <div className="ad-muted" style={{ fontSize: 11.5 }}>
                            {i.description}
                          </div>
                        )}
                      </td>
                      <td>{CATEGORY_LABEL[i.category] ?? i.category}</td>
                      <td>{i.billing === "monthly" ? "Monthly" : "One-time"}</td>
                      <td>
                        {fmtMoney(i.from_cents / 100, 0)}
                        {i.billing === "monthly" ? "/mo" : ""}
                      </td>
                      <td>
                        <form action={retireCatalogItem}>
                          <input type="hidden" name="id" value={i.id} />
                          <button type="submit" className="ad-btn ghost sm">
                            Retire
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {live.map((i) => (
            <section className="ad-panel" key={`edit-${i.id}`}>
              <h2 className="ad-panel-title">Edit &mdash; {i.name}</h2>
              <ItemForm item={i} />
            </section>
          ))}

          {retired.length > 0 && (
            <section className="ad-panel">
              <h2 className="ad-panel-title">Retired</h2>
              <p className="ad-hint">
                Kept, never deleted &mdash; past invoices point at these, and the
                revenue history needs their name and category to still make sense.
              </p>
              <ul className="ad-checklist muted">
                {retired.map((i) => (
                  <li key={i.id}>
                    <form action={restoreCatalogItem}>
                      <input type="hidden" name="id" value={i.id} />
                      <button type="submit" className="ad-check" title="Restore">
                        ↺
                      </button>
                    </form>
                    <span>
                      {i.name} &mdash; {CATEGORY_LABEL[i.category] ?? i.category}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div>
          <section className="ad-panel">
            <h2 className="ad-panel-title">Add something</h2>
            <ItemForm />
          </section>
        </div>
      </div>
    </>
  );
}
