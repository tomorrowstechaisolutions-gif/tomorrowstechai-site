import type { Course } from "../types";

/**
 * The flagship. Ten short video lessons, roughly 60–90 minutes, built on
 * Volume 02 (The Art of Voice Prompting).
 *
 * Lessons 1 and 2 are previews: anyone can read them. The rest show their
 * summary and "build this" until the course opens. Drop a YouTube id into
 * `video` as each lesson is recorded.
 */
export const speakMethod: Course = {
  slug: "speak-method",
  title: "Mastering AI Communication: The S.P.E.A.K. Method",
  tagline: "Stop memorizing prompts. Learn to say what you mean, and get results that match what's in your head.",
  level: 2,
  price: { kind: "paid", amount: 39, note: "Founding student price" },
  status: "waitlist",
  framework: "speak",
  volume: "02",
  flagship: true,
  audience: "Owners, managers, employees and builders who use AI every week and want better results without learning to code.",
  build: "A personal prompt library: five tested S.P.E.A.K. prompts for real tasks in your own work, plus your before-and-after results.",
  outcomes: [
    "Use the five S.P.E.A.K. steps by habit, typed or spoken",
    "Use your voice to give AI the context you'd normally leave out",
    "Get AI to interview you instead of guessing",
    "Fix a draft without starting over",
    "Measure whether your prompts are actually getting better",
  ],
  includes: [
    "10 short video lessons",
    "About 60–90 minutes",
    "Real screen-recorded demonstrations",
    "Downloadable workbook",
    "Practical assignments",
    "Final knowledge check",
    "Certificate of completion",
  ],
  modules: [
    {
      title: "Module 1 · Why communication beats prompt engineering",
      summary: "The idea the whole method stands on.",
      lessons: [
        {
          slug: "the-microphone-button",
          title: "The most overlooked tool in AI: your microphone",
          minutes: 7,
          preview: true,
          summary: "Why people get generic answers, and why talking instead of typing changes what you give the AI to work with.",
          body: [
            { kind: "p", text: "Everybody is talking about prompt engineering. Courses, templates, cheat sheets, people selling magic phrases. Meanwhile one of the most useful tools in AI is sitting right in front of you: the microphone button." },
            { kind: "p", text: "When we type, we shorten our thoughts. \"Build me a website.\" \"Write a marketing plan.\" Then we wonder why the result feels generic." },
            { kind: "p", text: "When we talk, we explain. We say why something matters. We describe what's frustrating us. We mention the thing we tried last month that didn't work. That extra context is exactly what the AI was missing." },
            { kind: "callout", title: "Be honest about what voice does", text: "Voice doesn't make the AI smarter. It makes it easier for you to give it the detail, context and expectations that produce better results. A detailed typed prompt works just as well. Most people just never type one." },
            { kind: "p", text: "You don't need perfect grammar. You don't need technical words. You don't even need your thoughts organized. You need to communicate, and let the AI help you organize." },
          ],
          build: "Pick one task you'd normally type in a single line. Press the mic and talk about it for 60 seconds instead. Save both results.",
        },
        {
          slug: "brief-it-like-a-new-hire",
          title: "Brief it like a new hire",
          minutes: 6,
          preview: true,
          summary: "The mental model behind every S.P.E.A.K. prompt, with a real before-and-after.",
          body: [
            { kind: "p", text: "Imagine hiring someone, walking into their office, saying \"build me a marketing campaign,\" and walking out. They'd have no idea about your goals, your customers, your budget or what you've already tried." },
            { kind: "p", text: "AI is that new hire. Capable, fast, and completely in the dark about your business until you brief it." },
            { kind: "compare", weak: "Write a sales post.", strong: "We build managed websites for local contractors. Write a short LinkedIn post for owners who are tired of their site never getting updated. Lead with the problem, no exaggerated claims, and end with a low-pressure invite to talk. Give me two different angles.", note: "The second version gives the offer, the audience, the tone, the channel and what to avoid." },
            { kind: "p", text: "S.P.E.A.K. is just a checklist for a good briefing, so you don't have to remember it all on the fly:" },
            { kind: "list", items: ["S: State your objective", "P: Provide context", "E: Express your expectations", "A: Ask for clarification", "K: Keep refining"] },
          ],
          build: "Rewrite one of your one-line requests as a new-hire briefing. Don't worry about S.P.E.A.K. yet, just explain it like you would to a person.",
        },
      ],
    },
    {
      title: "Module 2 · The five steps",
      summary: "One lesson per letter, each with a live demonstration.",
      lessons: [
        {
          slug: "s-state-your-objective",
          title: "S · State your objective",
          minutes: 7,
          summary: "Lead with the outcome and the reason. The difference between \"write an email\" and \"get this client to approve the change order by Friday.\"",
          build: "Write the objective line for three real tasks. One sentence each: what you want and why.",
        },
        {
          slug: "p-provide-context",
          title: "P · Provide context",
          minutes: 8,
          summary: "What the AI can't know unless you say it: your business, your people, your constraints, what you already tried.",
          build: "Talk through the background for one task for two minutes. Have AI separate it into facts, assumptions and open questions.",
        },
        {
          slug: "e-express-your-expectations",
          title: "E · Express your expectations",
          minutes: 7,
          summary: "Format, audience, tone, length, and what \"done\" looks like. Also what you don't want.",
          build: "Add a clear expectations section to one prompt, including at least one thing to avoid. Compare the output to your last attempt.",
        },
        {
          slug: "a-ask-for-clarification",
          title: "A · Ask for clarification",
          minutes: 8,
          summary: "Turn the AI into the one asking questions. One question at a time, most important first, before it guesses.",
          build: "Use the interview prompt on a decision you've been putting off. Answer five questions, then ask for a one-page decision brief.",
        },
        {
          slug: "k-keep-refining",
          title: "K · Keep refining",
          minutes: 8,
          summary: "How to fix a draft without starting over: say what's right, say exactly what to change, and protect what you already approved.",
          build: "Take a draft through three rounds of refinement. Write down what you changed each round.",
        },
      ],
    },
    {
      title: "Module 3 · Putting it to work",
      summary: "Real business tasks, measured results, and your final check.",
      lessons: [
        {
          slug: "dictation-vs-live-voice",
          title: "Dictation vs. live voice conversation",
          minutes: 7,
          summary: "When to dictate an exact request, when to talk it out live, and how to check what the transcript got wrong.",
          build: "Do one task with dictation and one with live voice. Note which fit which job.",
        },
        {
          slug: "speak-at-work",
          title: "S.P.E.A.K. at work: ops, projects, marketing, websites",
          minutes: 10,
          summary: "Watch the method applied to real jobs: scheduling crews, planning a launch, a sales post, a website brief, and troubleshooting.",
          build: "Build S.P.E.A.K. prompts for the five tasks that eat the most of your week. These become your prompt library.",
        },
        {
          slug: "measure-and-certify",
          title: "The 15-minute experiment and your final check",
          minutes: 9,
          summary: "Prove it to yourself: same task, short prompt vs. S.P.E.A.K., scored on the same criteria. Then the knowledge check and your certificate.",
          build: "Run the experiment on one real task, record time and revisions for both, then complete the knowledge check.",
        },
      ],
    },
  ],
};
