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
