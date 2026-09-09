# Services management

Implemented and deployed to production on 2026-09-09. The production schema migration is recorded as `20260909152556 service_operations`, and application commit `4ed34d0` is live on Vercel.

## Data model

`catalog_items` is the shared service identity and operational price source. No new offerings or production clients are seeded. Existing Catalog records acquire operational defaults. `tasks.service_id`, proposal lines and invoice lines reference those same IDs.

Internal costs live exclusively in `service_costs`. Owners/admins can read and edit them; the existing viewer role cannot read costs or margins. All mutations recheck authorization, and the new tables enforce RLS. Public sales-choice responses use an explicit safe projection. Signed proposal and paid invoice protections remain in place.

Services provides a paginated/searchable/filterable table, real aggregate KPIs, creation/editing, draft duplication, status confirmation, detail tabs, package relationships, client assignments, price history and activity. Each service can also hold one current ad creative in a private image bucket, with authenticated preview/download and owner/admin upload, replacement and removal controls. Catalog links to these same records to manage pricing and availability. Recurring operational pricing supports monthly, quarterly, yearly and custom intervals expressed in months.

## Revenue and billing

- Financial metrics are collected USD, attributed from invoice payments to service-linked one-time lines in proportion to the invoice subtotal. This allocates discounts and partial receipts without counting list prices as revenue. Legacy catalog-linked invoices are used only when no itemized lines exist; their paid fallback is excluded when the payment ledger has receipts.
- Existing unlinked financial history is not guessed into services. New services can therefore have zero attributed revenue even when similar historic work exists.
- MRR comes from the agreed client-service price divided by its interval in months. This is an operational run rate, not a payment-provider balance.
- Proposal and invoice builders can select enabled services and preserve the ID plus a safe billing snapshot. The selling price remains on the document line. Proposal-to-invoice conversion retains service attribution, recurring lines and unitemized base pricing.
- The existing proposal/invoice billing engines support **monthly/yearly** terms. Quarterly/custom recurring services require a separate custom billing arrangement; the picker explicitly disables unsupported intervals. This change does not add a tax engine or usage meter. Taxability is preserved as metadata for review.
- Catalog, proposal and manual-invoice availability are connected to their existing sales paths. Public/intake visibility flags are stored for downstream use; existing static marketing/package pages are not dynamically rewritten by them.

## Activation workflows

Manual assignment, signing a service-linked proposal with an existing client, and payment of a service-linked invoice create client-service assignments. Assignments use sold prices and quantities. Unlinked clients must first be linked through the existing client/proposal flow.

Optional activation creates or reuses the existing project, applies a selected task template (including dependencies), and can create an admin review task. Database uniqueness, transactions and row locks prevent replay from generating duplicate projects or assignments. Proposal conversion reuses a service-generated project. Explicitly linked subscriptions follow the existing customer's provider status/renewal synchronization.

No external email is sent and no provider billing/provisioning call runs from these new settings. Welcome email, intake sending, subscription creation, website provisioning and hosting provisioning still use their existing workflows. Changing an assignment's status manually does not cancel billing at the provider.

## Verification

- `npx tsc --noEmit`
- `npm run build`
- ESLint on all changed Services/integration files
- `node scripts/verify-service-pricing.mjs` (Node 24)
- `node scripts/verify-services.mjs <absolute-path-to-@electric-sql/pglite/dist/index.js>`

The database test applies the entire repository migration chain to an isolated PostgreSQL WASM runtime, then tests RLS, cost confidentiality, amount validation, atomic saves, conflict detection, package cycles, project/task replay, partial-payment/discount attribution, sold quantities, signed-proposal activation and historical prices. The harness supplies Supabase auth functions and a test-only pgcrypto substitute; it is not a production database test.

Repository-wide lint currently reports 13 pre-existing errors in older meeting, intake, client and removed-shop files. Scoped lint passes. Local browser verification reaches the proper sign-in gate; authenticated UI, responsive layout and browser-console checks remain to be completed with working project access.

## Operational follow-ups

1. Complete destructive-flow browser tests in a non-production dataset: create/edit, status changes, package changes, client activation and sales document conversion.
2. Verify mobile table scrolling and modal keyboard behavior across supported browsers.
3. Mount `Y:` and update `Y:\CommandCenter\status\ttai-website.md` using the existing stable checklist IDs. That drive is unavailable in this session, so Argus status has not been updated.
