# Field Notes → CRM: tracking article readers who become leads

Status: **plan only** (Phase 5, Nov 9 2026). Nothing here is built. No database
changes are required: every field below already exists on `leads` /
`lead_events`.

## Principle: two different questions, two different tools

| Question | Where it's answered | Why |
|---|---|---|
| How many people read the article, from where, how far? | **GA4** (already installed, consent-gated) and **Search Console** | Anonymous, aggregate, consent-respecting. |
| Which leads came from the article? | **Admin Center CRM** (`leads`, `lead_events`) | Only people who chose to contact us. |

We do **not** put anonymous visitors into the CRM. A CRM record starts when a
person submits a form. This keeps the CRM clean and avoids building visitor
profiles people never agreed to.

## What happens today (gap)

- The contact form sends only the selected offer. It does **not** call the
  existing `captureAttribution()` helper, so UTM tags, referrer and the real
  landing page are lost.
- For `/contact?service=…`, `leads.landing_page` and the `catalog_inquiry`
  event's `source_page` are always `/contact`. A lead sent by the flagship
  article looks identical to one that typed the URL.
- `/api/track` only relays conversions to Meta's Conversions API; it writes
  nothing to the CRM.

## Plan

### 1. Tag every article call to action (Field Notes code only)

Article CTAs (rail, mid-article, end, and the in-body link) link to:

```
/contact?service=private-on-site-ai&from=/blog/<slug>&cta=<rail|inline|end|body>
```

`from` is a site path only (validated server-side to start with `/blog/`);
no personal data ever goes in a URL.

### 2. Carry the article into the lead (small change to `/contact`)

- `src/app/contact/page.tsx`: accept `from` and `cta`; when `from` is a valid
  `/blog/` path, set `offer.sourcePage = from`.
- Result with **no schema change**:
  - `leads.landing_page` = `/blog/lawyer-private-ai-server-used-v100-gpus`
  - `lead_events` (`catalog_inquiry`) `meta.source_page` = the article,
    plus `meta.cta` = which button they used.

### 3. Keep how they found the article (reuse existing helper)

- Call `captureAttribution()` on Field Notes pages (it already stores the
  first-touch UTM / referrer for the session) and send `getAttribution()`
  with the contact form.
- `/api/contact` passes `utm_*`, `referrer`, `fbclid`, `gclid` into
  `intakeLead()`, which already writes those `leads` columns.
- Share links and the newsletter will use
  `utm_source=field-notes&utm_medium=<linkedin|x|email|newsletter>&utm_campaign=<slug>`
  so LinkedIn readers who later reach out are attributed correctly.

### 4. Measure reading in GA4 (consent-gated, no PII)

Custom events, only sent when analytics consent is granted:

| Event | Parameters | Purpose |
|---|---|---|
| `article_view` | `slug`, `category` | Reads per article/section |
| `article_progress` | `slug`, `percent` (50, 90) | Did they finish it? |
| `cta_click` | `slug`, `cta`, `service` | Which placement converts |
| `share_click` | `slug`, `network` | What spreads |
| `generate_lead` (key event) | `source_page`, `service` | Article → lead conversion |

### 5. Show it in the Admin Center

- **Lead detail:** already shows `landing_page` and the `catalog_inquiry`
  event; after step 2 these name the article and the button.
- **Content Studio / SEO board, new read-only panel "Field Notes → leads":**
  `select landing_page, count(*) from leads where landing_page like '/blog/%'
  group by landing_page` over 7 / 28 / 90 days, joined with GA4 views when the
  GA4 Data API is connected. Before that connection exists, the panel shows
  leads only and says views are "not connected" (same honesty rule as the
  rest of the Admin Center).

## Rollout and test (before the flagship publishes)

1. Build steps 1–3 on a branch; no production data touched.
2. Test on a preview deployment with a test inquiry whose email is clearly
   marked as a test; confirm `landing_page`, `source_page`, `cta` and UTM
   fields on the lead. Preview deployments write to the same Supabase
   database as production, so this test creates (and then removes) one real
   CRM row: it needs John's go-ahead first, or a Supabase branch database.
3. Confirm GA4 events in DebugView with consent granted, and that **no**
   events fire when consent is declined.
4. Ship with the article.

## Decisions needed

1. Approve steps 1–3 (code only, no schema change).
2. Approve the GA4 events in step 4.
3. Build the Admin panel now, or after a few weeks of data?
