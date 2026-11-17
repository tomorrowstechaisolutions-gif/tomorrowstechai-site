import { openBillingPortalAction } from "../member-actions";

const INVOICE: Record<string, [string, string]> = {
  sent: ["Due", "due"],
  partial: ["Part paid", "due"],
  paid: ["Paid", "ok"],
  expired: ["Expired", "muted"],
  void: ["Void", "muted"],
  refunded: ["Refunded", "muted"],
};

const SERVICE: Record<string, [string, string]> = {
  active: ["Active", "ok"],
  paused: ["Paused", "due"],
  pending: ["Starting", "info"],
  cancelled: ["Cancelled", "muted"],
  canceled: ["Cancelled", "muted"],
  ended: ["Ended", "muted"],
  completed: ["Completed", "muted"],
};

export function InvoiceStatus({ status }: { status: string }) {
  const [label, tone] = INVOICE[status] ?? [status, "muted"];
  return <span className={`acct-chip ${tone}`}>{label}</span>;
}

export function ServiceStatus({ status }: { status: string }) {
  const [label, tone] = SERVICE[status] ?? [status.replace(/_/g, " "), "muted"];
  return <span className={`acct-chip ${tone}`}>{label}</span>;
}

/** "Manage billing" opens the member's Stripe billing page (card, receipts, cancel). */
export function BillingButton({ back, label = "Manage billing" }: { back: string; label?: string }) {
  return (
    <form action={openBillingPortalAction} className="acct-inline-form">
      <input type="hidden" name="back" value={back} />
      <button className="acct-link-btn">{label}</button>
    </form>
  );
}

const BILLING_NOTICE: Record<string, string> = {
  unavailable: "The billing page isn't available for your account right now. Send us a request and we'll sort it out.",
  busy: "Too many tries in a row. Wait a few minutes and try again.",
};

export function BillingNotice({ code }: { code?: string }) {
  const msg = code ? BILLING_NOTICE[code] : undefined;
  return msg ? <p className="acct-msg err" role="alert">{msg}</p> : null;
}
