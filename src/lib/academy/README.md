# Tomorrow's Tech AI Academy

Live at `/academy`. Everything here is content in TypeScript files. No database, no admin screen. The pages read these files and update on the next deploy.

| File | What it holds |
|---|---|
| `brand.ts` | Founder's quote, mission, slogans, S.P.E.A.K. and H.U.M.A.N., the six principles, the four levels |
| `library.ts` | The Business AI Series volumes (free PDFs). A volume with `magnet` is live |
| `courses/*.ts` | One course per object. `intro-to-ai.ts` and `speak-method.ts` are full examples |
| `catalog.ts` | The course list (`COURSES`), and `canRead()`, the single rule for who can read a lesson |

## Add a lesson or module

Open the course file and add to its `modules` array. Lesson body blocks: `p`, `h`, `list`, `quote`, `prompt` (has a Copy button), `compare` (weak vs. strong request), `callout`.

```ts
{
  slug: "my-new-lesson",          // the URL; never change it once live
  title: "My new lesson",
  minutes: 8,
  summary: "Shown publicly even when the lesson is locked.",
  video: "dQw4w9WgXcQ",            // YouTube id, or a full mp4 URL
  preview: true,                   // anyone can read it, even in a paid course
  body: [{ kind: "p", text: "…" }],
  build: "What the student makes before moving on.",
}
```

## Open a course

- `status: "planned"`: shows the outline plus a "tell me when it opens" list.
- `status: "waitlist"`: shows the curriculum and preview lessons, and collects founding students.
- `status: "open"` on a free course: every lesson is readable.

A planned course uses `outline` (a list of topics). Swap it for `modules` when lessons exist.

## Add a course

Create `courses/my-course.ts` exporting a `Course`, import it in `catalog.ts`, and add it to `COURSES`.

## Add a Business AI Series PDF

1. Put the PDF in `public/downloads/` and a cover in `public/academy/covers/`.
2. Add a magnet to `MAGNETS` and its email to `FORM_SLOTS.magnet` in `src/lib/forms/email-content.ts`.
3. Set `magnet` and `cover` on the volume in `library.ts`.

## Sign-ups

Founding-student and corporate-training forms post to `/api/academy/waitlist`. They land in the CRM as leads with `source: "academy"` and tags `academy` + `academy:<course-slug>` (or `academy:corporate`). Owner alert key: `lead.academy`.

## Selling a course

1. Run `supabase/migrations/20261127010000_academy.sql` once in Supabase (enrollments + certificates tables).
2. Set the course's `status` to `"open"`. A paid open course shows **Enroll for $X**, which goes to Stripe Checkout (price comes from the course file; promo codes allowed).
3. After paying, Stripe returns the buyer to `/api/academy/claim`, which reads the session back from Stripe, records the enrollment, sets their access cookie and opens the course. The Stripe webhook records it too, in case they close the tab. The buyer gets an email with a sign-in link either way, and you get an `academy.sale` alert. The sale is booked in `revenue_events` (category `other`, campaign `Academy`).

## Student access (no passwords)

- Access is a signed cookie holding the buyer's email and course slugs. Signing key: `ACADEMY_ACCESS_SECRET`, falling back to the Supabase service-role key.
- New device: `/academy/access` emails a one-hour sign-in link to the address they paid with.
- Give a course for free: insert a row with `status = 'comp'` (example at the bottom of the migration), then have them use `/academy/access`.
- Refund: set the row's `status` to `'refunded'`. Their existing cookie still works until it's replaced; the next sign-in link won't include that course.

## Knowledge check and certificates

A course with `quiz` gets `/academy/<course>/check`. Answers are graded on the server and never sent to the browser. A pass issues a certificate with a code like `TTA-7K2M-QX9P` and a public page at `/academy/certificates/<code>`, printable to PDF. One certificate per email per course.

## Still to do

- Record the lesson videos and drop each YouTube id into `video`.
- Lesson progress is still kept in the browser (localStorage), not on the server.
