/**
 * The kinds of alert the site sends John. Kept apart from the sending code so
 * anything can read the list, including code that never touches the server.
 */

export type NotificationKey =
  | "lead.contact_form" | "lead.new" | "lead.guide" | "lead.ctai" | "lead.magnet_download" | "newsletter.subscribe"
  | "proposal.signed" | "proposal.declined" | "request.completed"
  | "invoice.paid" | "invoice.partial"
  | "portal.request" | "portal.new_service"
  | "billing.cancel_scheduled" | "billing.cancel_undone" | "billing.subscription_ended";

export type NotificationDef = { key: NotificationKey; group: "Leads" | "Sales" | "Money" | "Clients"; label: string; when: string };

export const NOTIFICATIONS: NotificationDef[] = [
  { key: "lead.contact_form", group: "Leads", label: "Contact form", when: "Someone sends the contact form on tomorrowstechai.com. Reply-to is the visitor." },
  { key: "lead.new", group: "Leads", label: "New lead from a campaign form or Meta ad", when: "A new lead from the business-launch form or a Facebook/Instagram instant form." },
  { key: "lead.guide", group: "Leads", label: "Site guide finished", when: "A visitor answers Tess's questions on the site and gets a recommendation. A second email follows if they ask for a call." },
  { key: "lead.ctai", group: "Leads", label: "Central Texas AI interest", when: "A business or partner fills in the Central Texas AI interest form." },
  { key: "lead.magnet_download", group: "Leads", label: "Lead magnet download", when: "A new person downloads a guide and joins your email list." },
  { key: "newsletter.subscribe", group: "Leads", label: "Newsletter signup", when: "A new person subscribes to Field Notes." },
  { key: "proposal.signed", group: "Sales", label: "Proposal signed", when: "A client signs a proposal." },
  { key: "proposal.declined", group: "Sales", label: "Proposal declined", when: "A client declines a proposal, with their reason." },
  { key: "invoice.paid", group: "Money", label: "Invoice paid", when: "A client pays an invoice in full by card (Stripe)." },
  { key: "invoice.partial", group: "Money", label: "Invoice partly paid", when: "A card payment covers part of an invoice." },
  { key: "request.completed", group: "Clients", label: "Client finished a request", when: "A client completes something you asked them for (an action request)." },
  { key: "portal.request", group: "Clients", label: "Member portal request", when: "A member asks a question, reports a problem or asks for a change in the portal." },
  { key: "portal.new_service", group: "Clients", label: "Member wants a new service", when: "A member asks for a new service from the portal." },
  { key: "billing.cancel_scheduled", group: "Money", label: "Cancellation scheduled", when: "A client schedules their subscription to cancel." },
  { key: "billing.cancel_undone", group: "Money", label: "Cancellation undone", when: "A client takes back a scheduled cancellation." },
  { key: "billing.subscription_ended", group: "Money", label: "Subscription ended", when: "A client's subscription actually ends." },
];
