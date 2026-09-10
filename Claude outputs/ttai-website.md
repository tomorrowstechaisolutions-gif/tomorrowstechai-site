---
id: ttai-website
name: TomorrowsTechAI Website
status: live
percent: 88
updated: 2026-09-10
commit: 3498edc

summary: |
  The public marketing site is live and selling. The work now is the Admin Center
  behind it, which is close to being the whole business in one place. This session
  shipped the AI Solutions module: the six Claude systems this company already runs
  in production — the website chat assistant, the business advisor, the content
  generator, the ad-copy writer, the task prioritiser and the week planner — are now
  registered, instrumented and measured rather than being six untracked API calls.
  Every one of them records tokens, latency and outcome on each call. What is NOT
  yet true: no model rates have been entered, so every cost and margin figure on
  those screens honestly reads "Rate not set" until John types the rates he is
  actually billed. The migration is applied to Supabase; the code is on disk and
  needs pushing.

checklist:
  - { id: w1, label: "Public marketing site live on tomorrowstechai.com", done: true }
  - { id: w2, label: "Lead capture, intake and follow-up automation", done: true }
  - { id: w3, label: "Admin Center: clients, services, billing, proposals, invoices", done: true }
  - { id: w4, label: "Admin Center: websites, hosting, apps portfolio", done: true }
  - { id: w5, label: "Admin Center: AI Solutions operations platform", done: false, partial: true }
  - { id: w6, label: "Model rate card entered so cost and margin are real numbers", done: false }
  - { id: w7, label: "Admin Center: software and AI command centre sections", done: false }
  - { id: w8, label: "Nightly jobs: app health, AI provider checks, threshold alerts", done: false, partial: true }

openItems:
  - group: "AI Solutions — to finish"
    items:
      - "Enter the real per-million-token rates for claude-haiku-4-5 and claude-sonnet-4-5 under Manage providers. Until then every cost, margin and spend figure reads 'Rate not set' by design — the tokens are already recorded and will price retrospectively."
      - "Run Test on each provider once so the board shows a checked status instead of Unknown."
      - "Knowledge sources can be tracked and measured but nothing reads them at answer time: there is no vector store wired up. The Knowledge tab says so rather than implying retrieval works."
      - "Answer quality is not measured anywhere. Latency, errors and volume are; escalations and leads are the only honest proxies for quality."
  - group: "Deploy"
    items:
      - "34 files are written to the working tree and not yet committed or pushed. Vercel deploys on push."
      - "The ai-watch cron is registered in vercel.json for 06:50 UTC daily and needs CRON_SECRET already set (it is, the app-health cron uses it)."
  - group: "Still 'soon' in the sidebar"
    items:
      - "/admin/software — custom software and SaaS platforms"
      - "/admin/ai — the advisor's propose/approve review desk (the queue behind it is already live)"

nextMoves:
  - "Commit and push the 34 AI Solutions files, then open /admin/ai-solutions on production and confirm it loads — the Apps module shipped ahead of its migration once and cost an afternoon."
  - "Enter the two Anthropic model rates so cost, margin and the spend thresholds start producing real figures."
  - "Watch the first ai-watch cron run and confirm provider status stops reading Unknown."
  - "Decide whether client-facing AI deployments get their own recurring price rows, so AI revenue on the board stops depending on the catalog service alone."
---

Human notes (ignored by Argus)

⚠️ This file could NOT be written to `Y:\CommandCenter\status\ttai-website.md` from this
session — the Y: drive is not a folder connected to Cowork on this device, and the request
to grant it was refused. Copy it across before re-scanning:

    copy "C:\Users\hocki\Documents\03 - Projects\tomorrowstechai-site\Claude outputs\ttai-website.md" "Y:\CommandCenter\status\ttai-website.md"

⚠️ For the same reason the existing card could not be read, so the checklist ids above
(w1–w8) are a fresh set rather than a continuation of whatever is on the live card. Check
them against the card before applying — Argus matches by id, so a mismatch would relabel
existing rows.

What this session actually did, in one paragraph: built the AI Solutions section into a
working operations platform. Thirteen new tables, all RLS deny-by-default behind
`is_admin()`; a board with six KPIs, a needs-attention strip and a filterable solution
list; a detail screen with eleven tabs including prompt versioning with a real test
console, knowledge sources, per-tool permissions, usage, costs, performance, client
deployments, automation runs, logs and settings; and instrumentation added to all six
existing Claude call sites so the numbers on those screens are measured rather than
invented. Provider API keys are never read into a page — only the NAME of the environment
variable is ever shown. Model prices are seeded NULL on purpose: a guessed rate times a
million tokens is a confident wrong number on a finance screen.
