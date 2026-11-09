# Shared Conference Invitations — Partner Integration Contract (v0, draft)

**Status:** Defined, not implemented on either side. Synchronization is shown as
*pending configuration* everywhere in the Tomorrow's Tech AI (TTAI) admin. No
screen claims a partner meeting has been synchronized.

**Audited 2026-10-09:**
- **ROMAR Press** already runs a partner API gateway (`src/lib/integrations/gateway.ts`,
  `keys.ts`): hashed bearer keys (`romar_live_…` / `romar_test_…`), one named scope
  per route, 120 req/min per key, `Idempotency-Key` replay protection, request
  logging to `integration_activity`, and timestamped HMAC signatures
  (`x-romar-signature: t=<unix>,v1=<hex>` over `"<t>.<raw body>"`, 300 s window).
  Existing routes: `/api/v1/ping`, `/api/v1/tasks`, `/api/v1/marketing/*`.
  ROMAR also has its own Conference Center (`src/lib/conference/*`, own Zoom OAuth).
  **There is no conference-sharing scope or endpoint yet.**
- **TTAI** has no inbound partner gateway. It needs one (below).

This contract reuses ROMAR's conventions exactly so both sides share one mental
model, and so ROMAR's existing gateway does most of the work on its side.

---

## 1. Principles (non-negotiable)

1. **Each business keeps its own Zoom account, database and admin.** No shared
   database, no shared service-role key, no shared Zoom OAuth credential — ever.
2. **The host organization owns the meeting.** Only the host creates, moves or
   cancels it in Zoom. The invited organization receives a *copy* of shared
   fields and the **participant** join link.
3. **Minimum necessary data.** Never sent: Zoom `start_url` / host keys, OAuth
   tokens, internal notes, outcomes, CRM records, lead data, pipeline stages.
4. **Signed, authenticated, idempotent, replay-protected** server-to-server calls.
5. **Honest state.** An invitation is `pending` until the receiver returns 2xx;
   a failed delivery is retried and shown as failed, never as synced.

## 2. Identity and credentials

Each side issues the other an API key from its own admin (ROMAR: Settings →
Integrations; TTAI: Conference Center → Partner organizations, Phase 3):

| Direction | Caller authenticates with | Receiver verifies with |
|---|---|---|
| TTAI → ROMAR | `Authorization: Bearer romar_live_…` (issued by ROMAR) + signature using a webhook secret issued by ROMAR | ROMAR gateway |
| ROMAR → TTAI | `Authorization: Bearer ttai_live_…` (issued by TTAI) + signature using a secret issued by TTAI | TTAI gateway (to build) |

Keys are shown once, stored only as SHA-256 hashes by the issuer, and stored
encrypted (AES-256-GCM, `INTEGRATION_ENCRYPTION_KEY`) by the holder.

New scopes: `WRITE_CONFERENCE_INVITATIONS`, `READ_CONFERENCE_INVITATIONS`.

## 3. Headers (every request)

```
Authorization: Bearer <key issued by the receiver>
Content-Type: application/json
Idempotency-Key: <uuid; the same value on every retry of the same change>
x-<receiver>-timestamp: <unix seconds>          # x-romar-timestamp / x-ttai-timestamp
x-<receiver>-signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>
```

Refuse when: key unknown/revoked/expired, scope missing, signature mismatched,
timestamp outside ±300 s, or rate limit exceeded (429 with `Retry-After`).

## 4. Endpoints (implemented by BOTH sides, mirror image)

### 4.1 `PUT /api/v1/conference/invitations/{invitation_id}` — create or update
Scope `WRITE_CONFERENCE_INVITATIONS`. Upsert keyed by `invitation_id` (a UUID the
**host** generates once per meeting). Sent on create, reschedule and cancel.

```json
{
  "invitation_id": "8a3f…",
  "version": 3,
  "host_organization": { "key": "tomorrowstechai", "name": "Tomorrow's Tech AI" },
  "title": "ROMAR Press Partnership Meeting",
  "category": "partnership",
  "status": "scheduled",
  "start_at": "2026-10-15T19:00:00Z",
  "end_at": "2026-10-15T19:45:00Z",
  "timezone": "America/Chicago",
  "join_url": "https://us06web.zoom.us/j/84512345678?pwd=…",
  "zoom_meeting_id": "84512345678",
  "passcode": "123456",
  "agenda": "Shared agenda text only",
  "host_contact": { "name": "John Hockinson", "email": "john@tomorrowstechai.com" },
  "invitees": [{ "name": "Marilyn", "email": "marilyn@romarpress.com" }],
  "updated_at": "2026-10-09T17:00:00Z"
}
```

- `status`: `scheduled` | `cancelled`. (A reschedule is `scheduled` with new times
  and a higher `version`.)
- `version`: monotonically increasing integer. Receiver **ignores** a payload
  whose `version` ≤ the stored one (out-of-order delivery safe).
- `join_url` MUST be the participant URL. A receiver MUST reject a payload whose
  `join_url` contains `/s/` or `zak=` (host start links).

Response `200`/`201`:
```json
{ "invitation_id": "8a3f…", "version": 3, "receipt_status": "pending_acceptance" | "accepted" }
```

### 4.2 `POST /api/v1/conference/invitations/{invitation_id}/response` — accept / decline
Sent by the **invited** org back to the **host**. Scope `WRITE_CONFERENCE_INVITATIONS`.
```json
{ "response": "accepted" | "declined", "responder": { "name": "Marilyn" }, "responded_at": "…" }
```

### 4.3 `GET /api/v1/conference/invitations?updated_since=<iso>` — reconciliation
Scope `READ_CONFERENCE_INVITATIONS`. Returns only invitations where the caller's
organization is the invited party. Run hourly by each side to repair missed
deliveries. Paginated (`limit` ≤ 100, `cursor`).

## 5. Delivery and retries

- The host writes its own meeting row first, then an outbox row
  (`shared_meeting_invitations.delivery_status = 'pending'`), then delivers.
- Retries: 1 min, 5 min, 30 min, 2 h, 12 h; then `failed` and shown in the admin.
- The same `Idempotency-Key` is used on every retry of the same `version`.

## 6. Receiver behaviour

- Store the invitation as an **invited meeting** (separate from meetings it hosts),
  `host_organization` set, editable fields read-only in the UI.
- Show **Join Conference** (opens `join_url`). Never a host Start button.
- The receiver may keep **its own private notes** on its copy; those never travel back.
- A `cancelled` payload marks the copy cancelled; it is never deleted silently.

## 7. TTAI-side schema (Phase 3 — draft, NOT yet applied)

```sql
create table public.partner_connections (
  id uuid primary key default gen_random_uuid(),
  partner_key text not null unique,            -- 'romar-press'
  name text not null,
  base_url text not null,                      -- https://www.romarpress.com
  status text not null default 'pending_configuration'
    check (status in ('pending_configuration','active','disabled')),
  outbound_key_encrypted text,                 -- key ROMAR issued to TTAI (enc:v1:…)
  outbound_secret_encrypted text,              -- signing secret ROMAR issued to TTAI
  inbound_key_hash text,                       -- sha256 of key TTAI issued to ROMAR
  inbound_secret_encrypted text,
  scopes text[] not null default '{}',
  last_success_at timestamptz, last_error text, last_error_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.shared_meeting_invitations (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null unique,          -- the cross-org id
  partner_connection_id uuid not null references public.partner_connections(id),
  role text not null check (role in ('host','invited')),
  meeting_id uuid references public.meetings(id) on delete set null,  -- host side
  version integer not null default 1,
  shared_payload jsonb not null,               -- exactly what was sent/received
  receipt_status text not null default 'pending'
    check (receipt_status in ('pending','pending_acceptance','accepted','declined','cancelled','failed')),
  delivery_attempts integer not null default 0,
  next_attempt_at timestamptz, last_error text,
  private_notes text,                          -- never synchronized
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
-- RLS: admin select/update only; partner_connections secrets read by service role only.
```

## 8. What ROMAR Press needs to add

1. Scopes `WRITE_CONFERENCE_INVITATIONS`, `READ_CONFERENCE_INVITATIONS` in its gateway.
2. Routes 4.1–4.3 behind `authenticate(request, <scope>, …)`.
3. An "invited meetings" store and a **Join Conference** card in its Conference Center.
4. An outbound client (its own outbox + retries) for meetings Marilyn hosts.
5. Issue TTAI a `romar_live_` key with those scopes and a webhook signing secret.

## 9. Verification plan (both environments)

1. Ping with each key → 200 and correct scopes.
2. TTAI schedules a partnership meeting → ROMAR shows it as invited within 1 min;
   Join opens the same Zoom meeting ID.
3. Reschedule on TTAI → ROMAR copy updates (version +1). Cancel → copy cancelled.
4. Replay a captured request after 6 min → 401. Change one byte → 401.
5. Repeat 2–4 with ROMAR as host.
6. Confirm neither side's database contains the other's notes, CRM rows or tokens.
