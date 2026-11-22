# Social batch posts: design

Date: 2026-11-22. Approved by John in chat the same day.

## Intent

John wants at least one post a day on the Tomorrow's Tech AI social channels
without spending daily time on it, so his time goes to selling. Posts must be
good enough that he does not have to check each one.

## What was decided

John and Claude research and write a batch of posts together in a working
session. John reviews the whole batch once. The batch is loaded into Social
Center as scheduled posts, and the site's existing publisher sends one a day.
The first batch is 30 days. Later batches (60 to 90 days) are shaped by what
the first month's numbers show.

## Goals

- One post a day on LinkedIn (John's profile), Facebook (Tomorrows Tech AI
  Solutions) and Instagram (@tomorrowstechai), with no daily effort.
- A batch can be loaded in one step and re-run safely without duplicates.
- John is warned before the queue runs out.
- Every post can still be edited, moved or canceled from Social Center.

## Non-goals

- No AI writing posts on a schedule. Posts are written in sessions and
  reviewed by John before loading.
- No X posting. The X developer account has no API credits; revisit later.
- No changes to the crew's Content bot or its playbook gate.
- No other brands' accounts (Held, Dark Tides and the rest).
- No per-channel text variants. One text per post, written to work on all three.

## Anti-goals

- Invented facts, numbers, clients or first-person stories. First-person
  material comes only from John.
- Corporate or AI-sounding voice. The brand profile's rules apply: no emoji,
  no exclamation marks, no invented statistics.
- Neon, hologram or robot imagery on these channels.
- The queue going quiet without John knowing.

## Approaches considered

1. **Batch file plus loader (chosen).** A batch lives as a file in the repo.
   A script loads it as scheduled posts. The existing `social-publish` cron
   sends them. Small build, quality checked once by John, versioned content.
2. **A bot writes each day's post.** More to build (generation, guardrails,
   the crew gate), and nobody checks quality before it goes out. Rejected by
   John in favour of batches.
3. **Load by hand in the composer.** No build, but 30 to 90 posts entered one
   at a time. Rejected.

## Design

**Batch file.** One file per batch under `content/social/`, holding the
batch name and an ordered list of posts. Each post has a stable id, the date
it goes out, the text, an optional link, the key line for its card image, and
an optional real image to use instead of a card.

**Loader.** A script reads a batch file, checks every post (required fields,
no duplicate ids or dates, length limits per channel, brand rules that can be
checked mechanically), and creates one scheduled post per entry with a
destination for each of the three channels. It has a dry-run mode that prints
what it would do. Re-running skips posts already loaded, matched by batch name
and post id, so a fixed batch file can be loaded again safely.

**Card images.** Instagram requires an image. Each post without a real photo
gets a branded card rendered from its key line: dark background, the line in
large type, the Tomorrow's Tech AI mark, subtle cyan accent, 4:5 so it fits
Instagram. Cards are stored where the publisher can already read media from.

**Posting time.** 11:30 AM Central, every day, so a daily post does not land
on top of the 8:00 AM article posts on Tuesdays and Thursdays. The time is a
field in the batch file, with 11:30 as the default.

**Runway alert.** A daily check counts the days of scheduled batch posts
left. When exactly 14 days are left John gets one owner notification (the
existing email and phone push), again at 7 days, and again the day before the
last post goes out. The check is recorded in
the cron run log like the other jobs.

**Seeing the batch.** Loaded posts carry the batch name as their campaign, so
they can be found and filtered in Social Center's queue and calendar.

## Calls made by Claude (not decided by John)

- Card image on every post, on all three channels, unless a real photo is given.
- 11:30 AM Central as the default time.
- Alert thresholds of 14, 7 and 1 days.
- Batch files in the repo rather than a database table or an admin upload screen.

## Left to the builder

- Batch file format (JSON or TypeScript) and exact field names.
- How card images are rendered and stored, reusing what Ad Studio already does.
- Where the runway check runs (its own cron or folded into an existing one).

## After the build

Work the first 30-day batch with John: research the market, agree themes,
draft, collect his first-person stories, review, load.
