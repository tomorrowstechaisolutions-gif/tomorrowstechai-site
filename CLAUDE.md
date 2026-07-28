# TomorrowsTechAI Website — session instructions

This repo is the TomorrowsTechAI marketing site (tomorrowstechai.com).

## ⟳ Argus status sync — do this at the END of every work session

Argus Command (John's command center) shows a live card for this site. At the end
of any work session on this repo, **update the status file** so the card reflects
reality. John then opens Argus → Status Sync → Re-scan → Apply.

**File to write:** `Y:\CommandCenter\status\ttai-website.md`

Write a COMPLETE snapshot every time. Argus parses the YAML block between the
`---` fences and ignores the prose below. Use this exact shape:

```markdown
---
id: ttai-website               # REQUIRED — do not change
name: TomorrowsTechAI Website
status: live                   # idea | planning | building | beta | live
percent: 90                    # business / launch readiness, 0–100 (be honest)
updated: 2026-06-12            # today's date, ISO
commit: abc1234                # latest commit short hash

summary: |
  One honest paragraph: where the site actually stands right now. This becomes the
  summary text on the card.

checklist:                     # keep ids STABLE (w1, w2, w3 …); only change done / partial
  - { id: w1, label: "…", done: true }
  - { id: w2, label: "…", done: false, partial: true }
  # done:true = finished. partial:true = started (counts half toward the gauge).

openItems:                     # what's left, grouped
  - group: "…"
    items:
      - "…"

nextMoves:                     # ordered, most important first; item 1 = THE thing
  - "The single most important next action"
---

(Human notes below the closing fence are ignored by Argus.)
```

Rules:
- Keep checklist `id`s exactly as they are on the card (`w1`, `w2`, …). Argus matches by id.
- `percent` is launch readiness, not "how much code exists."
- If `Y:\CommandCenter\status\` doesn't exist, create it.
- Full contract: `Y:\CommandCenter\status\_ARGUS-STATUS-CONTRACT.md` and `argus-status/` in the command-center repo.
