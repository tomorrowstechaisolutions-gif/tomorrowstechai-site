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

## Not built yet

Payments and student accounts. Paid lessons stay locked (except previews) until they exist. When they do, change `canRead()` in `catalog.ts` and the progress store in `src/components/academy/progress.tsx` (it uses the browser's localStorage today).
