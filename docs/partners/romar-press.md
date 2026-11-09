# ROMAR Press — partner integration

**Relationships:** client ($29/mo site & backend management) · white-label marketing channel ·
revenue share (60% TTAI / 40% ROMAR of each sale after payment-processing fees) · conference partner.

**Admin:** Sales → Partners → ROMAR Press (`/admin/partners/romar-press`).

## What is live on the Tomorrow's Tech AI side
- Company **ROMAR Press**, client **Marilyn Robitaille, Ph.D.** (robitaille@romarpress.com), linked to the
  Romarpress website record, with **Website Hosting & Management $29/mo** as a client service.
- Draft invoice **INV-2026-0002** ($29/month recurring) — not sent. Send once TTAI Stripe is live.
- `partner_connections` row `romar-press` holding the agreed terms.
- Work-order sync every 15 min (`/api/cron/partner-sync`, also "Sync now"): ROMAR orders assigned to
  `fulfillment_owner = tomorrows-tech-ai` → `partner_work_orders` → a project in Projects (once, then the
  stage is ours). Orders that leave the feed are marked "no longer assigned", never deleted.
- Status push-back to ROMAR campaigns (`PATCH /api/v1/marketing/campaigns/{id}/status`) with idempotency
  keys and conflict handling — enabled per order once ROMAR's feed includes campaign ids.
- "Raise a task" into ROMAR's marketing queue (`POST /api/v1/tasks`).
- Revenue-share ledger (`partner_settlements`): sale, fee, net, share %, our share, their share; the two shares
  always add to the net (DB constraint). A settlement marked **paid** books exactly one `revenue_events` row
  (`external_id = partner:romar-press:<ref>`, category marketing).

## Environment (Vercel → tomorrowstechai-site → Production)
| Variable | Value |
|---|---|
| `ROMAR_API_KEY` | key issued in ROMAR Admin → Settings → Integrations, scopes `READ_MARKETING_ORDERS`, `UPDATE_MARKETING_STATUS`, `CREATE_TASKS` (+ `READ_PARTNER_SETTLEMENTS` when it exists) |
| `ROMAR_API_BASE_URL` | optional; defaults to `https://www.romarpress.com` |

## Needed on the ROMAR side (romarpress-site)
1. **Campaign ids in the orders feed** — add `campaigns: [{ id, name, status }]` to each row of
   `GET /api/v1/marketing/orders` (only campaigns of that order). Unlocks status push-back.
2. **Stripe Connect split on sale** (ROMAR Stripe = platform; TTAI Stripe = connected account):
   on `charge.succeeded` / `checkout.session.completed` for a marketing order with
   `fulfillment_owner = tomorrows-tech-ai`: read the charge's `balance_transaction.fee`,
   net = amount − fee, transfer `round(net × 0.60)` to the TTAI account with `source_transaction = charge`,
   `transfer_group = order code`. On refund: reverse the same proportion of the refunded net.
   Store each split in a `partner_settlements`-style table on ROMAR's side.
3. **Settlement feed** — `GET /api/v1/partner/settlements?since=<iso>` behind a new scope
   `READ_PARTNER_SETTLEMENTS`, returning ONLY the caller's share rows:

```json
{ "data": [{
  "settlement_id": "tr_…",              // Stripe transfer id
  "romar_service_order_id": "uuid",
  "description": "Launch campaign — <book title>",
  "currency": "usd",
  "sale_cents": 50000, "fee_cents": 1480,
  "share_pct": 60, "partner_share_cents": 29112,   // TTAI's share
  "sold_at": "2026-10-09T18:00:00Z",
  "status": "pending | paid | reversed | partially_reversed",
  "paid_at": "…", "reversed_cents": 0
}] }
```
   TTAI already polls this path; until it exists the sync reports "settlement feed not published yet".

## Recommended
A short written agreement covering the 60/40, "processing fees only", refunds/chargebacks (ROMAR as
Stripe platform carries them first), payout timing, and the $29/mo management fee.
