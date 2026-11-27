import type { Course } from "../types";

export const introToAi: Course = {
  slug: "intro-to-ai",
  title: "Introduction to Artificial Intelligence",
  tagline: "What AI actually is, what it isn't, and how to get real work out of it this week.",
  level: 1,
  price: { kind: "free" },
  status: "open",
  audience: "Business owners, employees and anyone who has tried AI and walked away unimpressed.",
  build: "Your first saved, reusable prompt for a task you do every week.",
  outcomes: [
    "Understand what these tools are good at and where they fall down",
    "Stop getting generic answers by giving AI what a new employee would need",
    "Know what is safe to paste and what never goes in",
    "Leave with one working prompt you will actually reuse",
  ],
  volume: "01",
  includes: ["5 short lessons", "About 35 minutes", "Copy-ready prompts", "Free, no account needed"],
  modules: [
    {
      title: "Start here",
      summary: "The ground floor. No jargon.",
      lessons: [
        {
          slug: "what-ai-actually-is",
          title: "What AI actually is (and isn't)",
          minutes: 6,
          summary: "A plain-English picture of the tools everyone is talking about, so you stop expecting magic and start expecting a capable assistant.",
          body: [
            { kind: "p", text: "Strip away the hype and the AI tools most people use, like ChatGPT, Claude and Gemini, do one thing extremely well. They work with language. They read what you give them, and they write back something that fits." },
            { kind: "p", text: "That sounds small. It isn't. Most of the work in a business is language: emails, estimates, procedures, reports, proposals, follow-ups, meeting notes. Anything that is mostly words, AI can help with." },
            { kind: "h", text: "What it is good at" },
            {
              kind: "list",
              items: [
                "Drafting: first versions of emails, posts, SOPs, proposals.",
                "Organizing: turning messy notes into a clean structure.",
                "Summarizing: long documents, threads and meeting notes.",
                "Thinking with you: options, trade-offs, questions you forgot to ask.",
              ],
            },
            { kind: "h", text: "What it is not" },
            {
              kind: "list",
              items: [
                "It is not a search engine. It can sound sure and still be wrong.",
                "It does not know your business unless you tell it.",
                "It is not connected to your email, CRM or website unless someone builds that connection.",
                "It does not replace your judgment. You approve what goes out.",
              ],
            },
            { kind: "callout", title: "The right mental model", text: "Think of it as a sharp new hire on day one. Fast, willing, well-read, and knows nothing about your company yet. Everything in this Academy builds on that idea." },
          ],
          build: "Write down three tasks from your week that are mostly words. Keep the list. You'll use it in lesson 5.",
        },
        {
          slug: "stop-treating-ai-like-google",
          title: "Stop treating AI like Google",
          minutes: 7,
          summary: "Why short requests get generic answers, and the simple habit that fixes it.",
          body: [
            { kind: "p", text: "Most people type into AI the way they type into Google. A few words, hit enter, hope for the best." },
            { kind: "compare", weak: "Build me a website for my business.", strong: "I run a residential landscaping company. Most of our customers are homeowners between 35 and 65. I want a website that makes us look established and trustworthy, shows our past work, and makes it easy to request an estimate. I don't want it to look like a cheap template. Before you start, ask me anything you need to know.", note: "Same tool. The second one gives it a business, an audience, an outcome and a boundary." },
            { kind: "p", text: "Picture walking into a new employee's office, saying \"build me a marketing campaign,\" and leaving. How would they know your goals, your budget, your customers, or what you already tried? AI is in the same spot." },
            { kind: "p", text: "That is not complicated prompt engineering. It is just communicating the way you would with a person." },
          ],
          build: "Pick one of your three tasks. Write the short version of the request, then a version that explains it like you would to a new hire. Run both. Compare.",
        },
        {
          slug: "human-led-ai-assisted",
          title: "Human-led, AI-assisted",
          minutes: 6,
          summary: "The one rule we teach everywhere: you drive, AI helps you get there faster.",
          body: [
            { kind: "quote", text: "Artificial intelligence should not replace your imagination. It should expand your ability to turn that imagination into reality.", by: "John C. Hockinson Jr." },
            { kind: "p", text: "Everyone can tell when something was copy-pasted straight out of a chatbot. Same phrases, same structure, no point of view. That kind of output costs you trust." },
            { kind: "p", text: "The fix isn't to avoid AI. It's to stay in charge of it. Your ideas, your experience and your judgment go in. AI helps you organize, draft and move faster. You decide what is good enough to put your name on." },
            {
              kind: "list",
              ordered: true,
              items: [
                "Start with your own thinking, even if it's messy.",
                "Use AI to shape it, challenge it and speed it up.",
                "Edit the result until it sounds like you.",
                "Check every fact, number, name and promise before it goes out.",
              ],
            },
          ],
          build: "Take the better of your two outputs from lesson 2 and edit it until you'd sign it. Notice what you changed. That's your voice.",
        },
        {
          slug: "what-is-safe-to-paste",
          title: "What's safe to paste (and what never goes in)",
          minutes: 6,
          summary: "A short, practical privacy checklist before you hand AI anything from your business.",
          body: [
            { kind: "p", text: "These tools are only as safe as how you use them. A few habits protect you, your customers and your company." },
            { kind: "h", text: "Never paste" },
            { kind: "list", items: ["Passwords, API keys or login codes.", "Credit card, bank or Social Security numbers.", "Confidential employee records.", "Customer data you haven't been authorized to use this way."] },
            { kind: "h", text: "Safer habits" },
            {
              kind: "list",
              items: [
                "Use a business account and check its data and training settings.",
                "Strip out names and details the task doesn't need.",
                "Test with fake or sample data first.",
                "Verify facts, math and citations against your own records.",
                "Keep a human approval step for anything customer-facing, financial or legal.",
              ],
            },
            { kind: "callout", title: "Rule of thumb", text: "If you wouldn't email it to a contractor you met last week, don't paste it into an AI tool you haven't vetted." },
          ],
          build: "Look at your three tasks. For each one, note what information it needs and whether any of it is sensitive. Cut what isn't needed.",
        },
        {
          slug: "your-first-saved-prompt",
          title: "Your first saved prompt",
          minutes: 10,
          summary: "Turn one weekly task into a prompt you reuse, so the win repeats every week instead of once.",
          body: [
            { kind: "p", text: "A good prompt is an asset. Write it once, test it, save it, and it pays you back every time that task comes around." },
            { kind: "p", text: "Use this structure. It comes straight from Volume 01 of the Business AI Series: role, business context, workflow, output format and boundaries." },
            {
              kind: "prompt",
              label: "Starter template",
              text: "You are my [role, e.g. customer service assistant].\n\nAbout my business: [what you do, who you serve, your tone].\n\nWhen I give you [the input, e.g. a customer email], do this:\n1. [first step]\n2. [second step]\n3. [third step]\n\nGive me the result as [format: bullet list, short email, table].\n\nRules: only use information I give you. If something is missing, ask me. Do not invent prices, dates or promises. I approve everything before it goes out.",
            },
            { kind: "p", text: "Run it on a real example. When it gets something wrong, don't start over. Add a rule that fixes it, then run it again. Three or four rounds is normal." },
            { kind: "p", text: "Once it works, save it somewhere you will find it: a note, a document, or a saved project or custom assistant if your tool has one." },
          ],
          build: "Finish and save one working prompt for one of your three tasks. Use it again next week. That's your first piece of AI infrastructure.",
        },
      ],
    },
  ],
};
