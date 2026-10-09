# Conference Center

**Admin path:** Command → Conference Center (`/admin/conference-center`)
**Settings:** `/admin/conference-center/settings`
**Status (2026-10-09):** Phase 1 built and verified locally. Live Zoom not yet
connected (needs the Zoom app + env vars below). Phases 2–4 not started.

## Architecture in one paragraph

The Conference Center is **not** a second meetings system. It is a Zoom-first
dashboard over the existing `meetings` table (migration 0020), which already
owned the CRM links, calendar display, lead/project/proposal timelines,
outcomes and follow-up tasks. Zoom was added exactly as 0020 planned: one
provider file (`src/lib/meetings/providers/zoom.ts`) behind the existing
`MeetingProvider` interface. So every existing "Schedule Meeting" button on
leads, clients, proposals and projects can now pick Zoom too, and every Zoom
conference appears on the Admin Calendar and the record timelines with no
extra code.

## What was built (Phase 1)

| Area | Files |
|---|---|
| Sidebar link (video icon, today badge) | `components/admin/cc/nav.ts`, `Icons.tsx` |
| Dashboard: Start Instant / Schedule, 5 KPI cards, upcoming (Start, Copy invite, Details, Reschedule, Cancel), consultation requests, history with filters/search/paging, analytics | `app/admin/(shell)/conference-center/page.tsx`, `components/admin/cc/conference/*`, `lib/conference/queries.ts` |
| Zoom OAuth (state + PKCE S256, admin-only, encrypted tokens, rotating refresh with race guard, revoke on disconnect) | `lib/zoom/oauth.ts`, `lib/zoom/crypto.ts`, `app/api/zoom/oauth/*` |
| Zoom Meetings API (create instant/scheduled, update, delete, get; one forced-refresh retry on 401; rate-limit message) | `lib/zoom/api.ts` |
| Host start link fetched fresh per click, never stored/emailed | `app/api/conference/[id]/start/route.ts` |
| Zoom webhook (signature + 5-min replay window; url_validation, meeting.started/ended/deleted, app_deauthorized) | `app/api/zoom/webhook/route.ts` |
| Conference categories (12, partner names from config, not hard-coded) | `lib/conference/config.ts`, `partners.ts` |
| Server actions with honest results (Zoom confirmed? email sent per recipient?) | `app/admin/conference-actions.ts` |
| Meeting defaults (waiting room, mute, recording off, buffers, conflict blocking, invite emails) | `lib/conference/settings.ts`, `ConferenceSettingsForm.tsx` |
| "Schedule Conference / Presentation / Client Review" on lead, client, proposal, project pages | `ScheduleConferenceLink.tsx` |
| Migration (additive) | `supabase/migrations/20261009120000_conference_center.sql` |

### Safety behaviour worth knowing
- **No success without Zoom.** Instant: if Zoom refuses, the row is deleted and the
  error shown. Scheduled: if Zoom refuses after the row is saved, the screen says
  "saved but Zoom did not confirm — Retry", and no invitation is emailed.
- **Double-submit safe.** Each form carries a UUID (`client_request_id`, unique index);
  a repeat returns the first meeting instead of creating a second Zoom meeting.
- **Conflicts blocked** against open meetings, with the configured buffer.
- **Guests only ever get the participant `join_url`.** Internal notes are stored in
  `internal_notes` and never sent to Zoom or email.
- **Email honesty.** If `RESEND_API_KEY` is missing or Resend rejects, the UI says
  so per recipient.
- **Basic plan** accounts get a 40-minute warning.

## Setup checklist (to go live)

1. **Apply the migration** `20261009120000_conference_center.sql` to Supabase
   (it was prepared but not applied in this session). Additive only. **Apply it
   before deploying** — the new meeting categories and the settings table depend on it.
2. **Create the Zoom app** at marketplace.zoom.us → Develop → Build App → *General App*
   (user-managed):
   - Redirect URL + allow list: `https://www.tomorrowstechai.com/api/zoom/oauth/callback`
   - Scopes: `meeting:write:meeting`, `meeting:read:meeting`, `meeting:update:meeting`,
     `meeting:delete:meeting`, `user:read:user`
   - Event subscription endpoint: `https://www.tomorrowstechai.com/api/zoom/webhook`
     with meeting.started, meeting.ended, meeting.deleted, and app deauthorization.
3. **Vercel env vars** (server-only, never `NEXT_PUBLIC_`):
   `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_WEBHOOK_SECRET_TOKEN`,
   `INTEGRATION_ENCRYPTION_KEY` (≥32 random chars; e.g. `openssl rand -hex 32`).
   Optional: `ZOOM_REDIRECT_URI`.
4. Redeploy → Conference Center → Zoom settings → **Connect Zoom**.
5. Run the live checks below.

## Verification done in this session

| Check | Result |
|---|---|
| `tsc --noEmit` | pass |
| ESLint on all new/changed files | 0 new errors (repo baseline unchanged) |
| `next build` (production) | pass; routes listed |
| Webhook: unsigned / tampered / 15-min-old → 401; signed url_validation → correct HMAC | pass |
| Admin routes unauthenticated (dashboard, settings, OAuth start/callback, host start) → redirect to login | pass |
| Token encryption: random IV, round-trip, tamper detected, plaintext refused, wrong key refused; PKCE S256 | pass |
| Zoom API against a mock: expired token → refresh (Basic auth) → rotated refresh stored encrypted → 401 → forced refresh + retry → create payload (UTC start, timezone, invitees, Zoom email off) → PATCH → DELETE 404 treated as gone → fresh start URL | pass |
| UI at 1440 px and 390 px, no horizontal overflow; tables become labelled cards on phones | pass |

**Not yet verified (needs live Zoom + migration):** real OAuth consent, real meeting
creation, host/guest joining, live webhooks, email delivery, calendar display of a
real Zoom meeting, RLS on `conference_settings` in production.

### Live test script (after setup)
1. Connect Zoom → settings shows account + plan.
2. Start Instant Conference → Zoom opens as host; copy guest link into a private window → joins the same meeting.
3. Invite a CRM lead to it → lead timeline shows the invite; email arrives with the participant link only.
4. Schedule a 30-min AI consultation for tomorrow from a lead page → Zoom meeting exists; on the Calendar; on the lead timeline; invitation email received.
5. Schedule another overlapping it → blocked with the clash named.
6. Reschedule → same Zoom ID/link, new time in Zoom. Cancel → deleted in Zoom, history shows Cancelled.
7. Mark complete with "Proposal requested" → follow-up task appears in Tasks; analytics update.
8. Delete a meeting directly in Zoom → it flips to Cancelled here (webhook).

## Roadmap

- **Phase 2 — Sales integration:** public `/book-consultation` (availability, booking
  tokens for self-reschedule/cancel, rate limit + bot trap, DB-level overlap guard),
  CRM dedupe on booking, pipeline activity, 24 h / 1 h reminder cron with idempotent
  delivery log, post-meeting actions (Create Proposal, Move Stage, Qualified / Not Interested).
- **Phase 3 — Cross-company:** see `partner-integration-contract.md`. ROMAR Press
  already has the partner gateway; both sides need the conference-invitation endpoints.
- **Phase 4 — AI & reuse:** Prepare-for-Meeting and Follow-Up Assistant on the existing
  advisor (notes-only; never claims to have heard the meeting), white-label packaging
  (`CONFERENCE_SCOPE`, per-install branding).
