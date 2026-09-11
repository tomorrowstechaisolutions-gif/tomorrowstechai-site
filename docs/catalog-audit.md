# Service and package catalog audit

Audited 2026-09-11. This is an implementation record, not a second runtime
catalog. The database is canonical after migration
`20260911120000_canonical_service_packages.sql`.

## Existing architecture

- `catalog_items` was already the stable sellable identity used by proposals,
  invoices, jobs, client services, hosting, software and automation.
- Services already had strong operational administration: pricing and cost
  history, availability controls, inclusions, deliverables, client assignments,
  workflow activation, sales attribution and media for ad creative.
- `service_package_relationships` already existed, but both sides referenced
  the same undifferentiated table. There was no package-only admin, package
  publishing model, package media, public metadata, or package feature override.
- Public package data was duplicated in `src/lib/website-packages.ts`,
  `src/lib/ai-operator/plans.ts`, `src/app/services/page.tsx`,
  `src/app/services/ai-business-operator/page.tsx`, and
  `src/components/grow-audience/MarketingPricing.tsx`.
- Website and AI intake routes validated against separate code constants.
  Marketing contact links carried plan IDs, but contact copy used another
  hard-coded label/price map and the contact route only sent email.

## Reconciled offer inventory

| Family | Canonical packages | Pricing | Public usage |
| --- | --- | --- | --- |
| Websites | Starter, Classic, Professional, E-Commerce, Custom Built | $149 / $399 / $699 / $999 one-time; custom starts at $1,500 | `/services`, `/website-intake` |
| AI Business Operator | AI Starter, AI Growth, AI Operator, Custom AI Business Operator | $199 / $399 / $699 monthly; custom starts at $999 monthly, with setup fees | `/services/ai-business-operator`, `/get-started` |
| Grow Your Audience | Starter, Growth, Full Service, Custom Growth System | $199 / $399 / $699 monthly; custom starts at $999 monthly | `/services/grow-your-audience`, `/contact` |
| Business systems | Custom Business System | Custom quote | `/services/run-your-business`, `/services`, `/contact` |
| Hosting | Website Hosting & Management | $29 monthly | `/services`, `/contact` |
| Branding | Logo Studio DIY | $39 one-time | `/logo-studio` |

The migration seeds individual services only where current public offer content
demonstrates a real distinct capability. Existing catalog records are retained;
new rows use stable slugs and conflict-safe inserts.

## Canonical rules

- `catalog_items.offer_kind` explicitly separates `service` from `package`.
- Services remain operational records. Packages remain sellable bundles.
- `service_package_relationships` connects a package to individual services
  and owns package-specific feature label, description, inclusion state, and
  order.
- Public loaders read active, public, non-archived packages on the server.
  Code constants remain only as a safe fallback while environments are waiting
  for the migration; they are no longer the primary source on connected pages.
- Archive is status-based. No package or service history is hard-deleted.
- Package images reuse the existing private `brand-assets` Supabase Storage
  bucket under `catalog/{package-id}/…` and are served through a guarded,
  cached public media route only for active public packages.

## Connected surfaces

- Admin Services list/editor and service-to-package relationship tab
- Admin Packages list, metrics, editor, relationships, media and usage view
- `/services` website pricing
- `/services/ai-business-operator` pricing
- `/services/grow-your-audience` pricing
- `/website-intake` selector and API
- `/get-started` selected AI package and API
- `/contact` package prefill, email, CRM lead and structured lead event
- Run Your Business primary package CTA

## Deliberate legacy/fallback areas

- The homepage capability layers are general marketing/navigation copy rather
  than priced offer records, so they remain page content.
- Logo Studio's tier UI and campaign-specific landing pages retain their custom
  checkout/configuration constants. Their sellable top-level offers are present
  in Catalog, but those specialized flows have payment behavior beyond a
  package card and should be migrated only with checkout-specific regression
  coverage.
- FAQ prose includes pricing for discoverability and customer explanation. It
  is not executable offer data and is listed here so price changes can be
  reviewed there.
