import type { ArticleRecord } from "@/lib/blog/types";

/**
 * Field Notes articles that live in code.
 *
 * Read through src/lib/blog/repository.ts — never import this array directly
 * into a page. The repository validates every entry against the editorial
 * standards (src/lib/blog/validate.ts) and fails the build on errors.
 *
 * New article checklist:
 *   - slug never changes once published (it is the URL)
 *   - status "draft" until it should go live; publishedAt is an ISO date
 *   - set updatedAt on meaningful edits
 *   - category is one of the six in src/lib/blog/taxonomy.ts
 *   - authorId defaults to the editorial team
 *   - hero needs descriptive alt text AND a credit
 *   - every factual claim from elsewhere cites a source: [^source-id] in the
 *     body, with the matching entry in sources[]
 *   - specs[] for technical figures; verified: true only after checking
 *   - discrepancies[] (and a > [!DISCREPANCY] callout) when sources disagree
 *   - body syntax: see the comment at the top of src/lib/blog/markdown.tsx
 *
 * The seven articles marked legacy predate these standards; their slugs,
 * titles, summaries and bodies are unchanged.
 */
export type FileArticle = Omit<ArticleRecord, "origin">;

export const fileArticles: FileArticle[] = [
  // ── AI News · DRAFT. Fast-moving story. Every figure below was checked
  //    against the listed sources on 2026-11-09. Before release: recheck for
  //    new developments (investigation findings, leadership changes, Nov. 17
  //    earnings, the FBI comment), set the real publishedAt and add the hero
  //    image. FBI line added 2026-11-09 evening after Trump's remarks.
  //    Editorial choice: the woman at the centre of the allegations is not
  //    named. The spying claim rests on unnamed officials and is denied.
  {
    slug: "nvidia-ceo-investigation-ai-hardware-buyers",
    title: "Nvidia Is Investigating Its Own CEO. Here's What It Means for Businesses Betting on AI Hardware.",
    status: "draft",
    publishedAt: "2026-11-09",
    category: "ai-news",
    secondaryCategories: ["hardware"],
    seo: {
      title: "Nvidia's CEO Investigation: What It Means for AI Hardware Buyers",
      description:
        "Nvidia's board is investigating whether CEO Jensen Huang was targeted by foreign intelligence. What's confirmed, what's alleged, and what it means for businesses.",
    },
    summary:
      "Nvidia's board has opened an independent investigation into reports that CEO Jensen Huang was the target of a foreign intelligence effort. Here's what's confirmed, what's only alleged, and the lessons for businesses that depend on one supplier, or one leader.",
    tags: ["Nvidia", "Jensen Huang", "AI hardware", "GPUs", "Key-person risk", "Social engineering", "Export controls", "Supply chain"],
    cta: {
      service: "private-on-site-ai",
      label: "Plan AI hardware with less supplier risk",
      blurb:
        "We help businesses size, source and run private AI systems, including a plan for what happens when a key supplier hits turbulence.",
    },
    sources: [
      {
        id: "nvidia-board",
        title: "Statement from NVIDIA Board of Directors",
        publisher: "NVIDIA (via GlobeNewswire)",
        url: "https://www.globenewswire.com/news-release/2026/11/08/3398017/0/en/statement-from-nvidia-board-of-directors.html",
        publishedAt: "2026-11-08",
        accessedAt: "2026-11-09",
        kind: "primary",
        note: "The board's own statement announcing the investigation.",
      },
      {
        id: "cnbc",
        title: "Nvidia investigates CEO Jensen Huang's relationship with alleged Chinese spy",
        publisher: "CNBC",
        author: "Kif Leswing and Kamaron McNair",
        url: "https://www.cnbc.com/2026/11/08/nvidia-jensen-huang-investigation-china-spy.html",
        publishedAt: "2026-11-08",
        accessedAt: "2026-11-09",
        kind: "secondary",
        note: "Includes Huang's email to staff, Megaspeed background and upcoming dates.",
      },
      {
        id: "cnbc-succession",
        title: "Jensen Huang affair puts Nvidia's future at risk, with no clear successor to the renowned CEO",
        publisher: "CNBC",
        author: "Annie Palmer and Lora Kolodny",
        url: "https://www.cnbc.com/2026/11/09/jensen-huang-affair-nvidia-succession.html",
        publishedAt: "2026-11-09",
        accessedAt: "2026-11-09",
        kind: "secondary",
        note: "Analyst comment on succession, Huang's ownership and Nvidia's own risk-factor language.",
      },
      {
        id: "bbc",
        title: "Nvidia launches investigation into CEO's affair with suspected Chinese spy",
        publisher: "BBC News",
        author: "Nathan Williams and Zoe Kleinman",
        url: "https://www.bbc.com/news/articles/c3dxw10rjn9no",
        publishedAt: "2026-11-08",
        accessedAt: "2026-11-09",
        kind: "secondary",
        note: "Summarises The New York Times' reporting and China's denial.",
      },
      {
        id: "ap",
        title: "What we know — and what we don't — as Nvidia investigates an alleged spy plot involving its CEO",
        publisher: "Associated Press (via Spectrum News)",
        url: "https://spectrumlocalnews.com/us/snplus/international/2026/11/09/nvidia-spy-plot-investigation-jensen-huang-what-we-know",
        publishedAt: "2026-11-09",
        accessedAt: "2026-11-09",
        kind: "secondary",
        note: "Includes Nvidia's spokesperson statement, Megaspeed's denial and analyst views on export controls.",
      },
      {
        id: "ap-fbi",
        title: "Trump says FBI is looking at Nvidia CEO Jensen Huang's affair with alleged Chinese agent",
        publisher: "Associated Press",
        author: "Josh Boak, Seung Min Kim and Kaitlyn Huamani",
        url: "https://apnews.com/article/china-denies-spy-jensen-huang-nvidia-3345b9f05c54d58909e88f6dcb9c1cd8",
        publishedAt: "2026-11-09",
        accessedAt: "2026-11-09",
        kind: "secondary",
        note: "President Trump's White House remarks on the FBI and his call with Huang.",
      },
      {
        id: "reuters",
        title: "Nvidia slides as CEO Huang faces board scrutiny over affair with alleged spy",
        publisher: "Reuters",
        author: "Heekyong Yang, Kyu-Seok Shim and Tom Westbrook",
        url: "https://www.reuters.com/world/asia-pacific/south-korea-says-nvidia-issues-wont-affect-contracted-gpu-supplies-2026-11-09/",
        publishedAt: "2026-11-09",
        accessedAt: "2026-11-09",
        kind: "secondary",
        note: "Supply-side reaction in Asia, including South Korea's expectation of no disruption to contracted GPU deliveries.",
      },
    ],
    specs: [
      { label: "Investigation announced", value: "November 8, 2026, by Nvidia's board", sourceIds: ["nvidia-board"], verified: true },
      { label: "Who runs it", value: "A committee of independent directors, with outside independent counsel", sourceIds: ["nvidia-board"], verified: true },
      { label: "Board's position so far", value: "\"No reason to believe\" national security or Nvidia secrets were compromised; confidence in Huang", sourceIds: ["nvidia-board"], verified: true },
      { label: "Huang's role", value: "Remains CEO and says he will cooperate fully", sourceIds: ["nvidia-board", "ap"], verified: true },
      { label: "The allegation", value: "U.S. intelligence officials believe a businesswoman close to Huang passed information to Beijing", note: "Reported by The New York Times citing unnamed sources; denied by China.", sourceIds: ["bbc", "ap"], verified: false },
      { label: "Megaspeed's Nvidia purchases", value: "More than $4.8 billion of chips over two years", note: "New York Times figure, as cited by the AP.", sourceIds: ["ap"], verified: false },
      { label: "Federal involvement", value: "President Trump said the FBI is \"looking into it in terms of something else\"", note: "Scope not described. Trump said Huang told him he had no idea the person was a spy.", sourceIds: ["ap-fbi"], verified: false },
      { label: "Contracted GPU deliveries", value: "South Korea expects no disruption to contracted Nvidia GPU deliveries", sourceIds: ["reuters"], verified: false },
      { label: "Huang's ownership", value: "Just over 3% of shares; one of 11 directors on a board with no official chair", sourceIds: ["cnbc-succession"], verified: false },
      { label: "Upcoming dates", value: "Third-quarter earnings Nov. 17; requested congressional briefing Nov. 18", sourceIds: ["cnbc"], verified: false },
    ],
    discrepancies: [
      {
        topic: "How far did Nvidia's stock fall on Monday, November 9?",
        accounts: [
          { sourceId: "ap", claim: "Shares sank nearly 5% as of midday Monday." },
          { sourceId: "reuters", claim: "Shares pared losses from an 8% slide to be down about 6% in early trading." },
          { sourceId: "cnbc-succession", claim: "Shares sank more than 4% on Monday, closing down 4.27%." },
        ],
        resolution: "The figures are from different times of day. We use the closing figure, down about 4%.",
      },
    ],
    body: `Most companies that buy AI hardware have never thought about Nvidia's board of directors. This week, that board became the story.

On Sunday, November 8, Nvidia's board announced an independent investigation "in light of recent reporting that founder and CEO Jensen Huang has been the target of a foreign intelligence effort." A committee of independent directors, working with outside counsel, will run it.[^nvidia-board]

The same day, Huang told employees he had had an affair, writing, "I was unfaithful to my wife," and said he supports the investigation.[^cnbc] Nvidia's shares closed down more than 4% on Monday while the broader market rallied.[^cnbc-succession]

On Monday evening, President Trump added a federal angle. "I know the FBI is looking into it in terms of something else, and I think that he'll be in good shape," he said at a White House briefing, without describing the scope. Trump said Huang told him "he had absolutely no idea that the person in question was a spy."[^ap-fbi]

The personal side of this story is being covered everywhere. This piece is about the other side: what's actually confirmed, and what it means if your business runs on, or is planning around, Nvidia hardware.

## What's confirmed and what's alleged

| Development | Status | Source |
|:--|:--|:--|
| Board investigation into whether Huang was targeted | Confirmed by Nvidia's board | Nvidia[^nvidia-board] |
| Board sees "no reason to believe" secrets were compromised | Board's stated position, investigation ongoing | Nvidia[^nvidia-board] |
| Huang stays on as CEO and will cooperate | Confirmed by Nvidia | Nvidia, AP[^nvidia-board][^ap] |
| A businesswoman close to Huang passed information to Beijing | Alleged by U.S. intelligence officials, per The New York Times; China denies it | BBC, AP[^bbc][^ap] |
| FBI "looking into it" | Stated by President Trump; scope not described | AP[^ap-fbi] |
| Congressional briefing on Nvidia's security protocols | Requested by three House committee chairs | CNBC, BBC[^cnbc][^bbc] |

The spying claim is an allegation. According to The New York Times, as summarized by the BBC and the AP, U.S. intelligence officials concluded that a businesswoman with a close relationship to Huang was gathering information for Beijing. She is a former executive of Megaspeed, a Singapore-based data center company and Nvidia customer.[^bbc][^ap] It remains unclear what information was allegedly passed or how valuable it was.[^bbc] China's foreign ministry called the allegation "groundless" and a smear.[^bbc][^ap]

Megaspeed bought more than $4.8 billion of Nvidia chips over two years, according to the Times.[^ap] It has faced claims that it helped restricted Chinese companies obtain Nvidia's AI chips; the company has said there was "no evidence" of illicit shipping.[^cnbc][^ap]

> [!NOTE] Reporting and analysis
> Sections headed "Our take" are Tomorrow's Tech AI's own analysis for businesses that buy and run AI systems. They are not predictions about the investigation's outcome.

## Why one person matters so much to Nvidia

Analysts have been blunt about how much Nvidia depends on its founder. "Jensen is Nvidia. Nvidia is Jensen," Bernstein's Stacy Rasgon told CNBC. Melius Research noted there is "no clear successor" and said it had expected Huang to stay at least ten more years.[^cnbc-succession] Shay Boloor of Futurum Equities told Reuters the key-person risk is "massive."[^reuters]

The structure explains why. Huang is co-founder, president and CEO, runs a famously flat organization and had 33 direct reports as of this week, according to internal records reviewed by CNBC.[^cnbc-succession]

There is a counterweight. Huang owns just over 3% of the company and is one of 11 directors on a board with no official chair. Nvidia's own filings don't single him out as a key person; they say the company is "highly dependent on the services of our longstanding executive team." Several analysts expect the investigation to bring governance changes such as a formal transition plan.[^cnbc-succession]

## Our take: key-person risk isn't just a Fortune 500 problem

Nvidia's situation is extreme, but the pattern is familiar to anyone who has run operations. A small contractor whose owner holds every client relationship. A shop where one estimator knows how every bid gets built. A business where one person has all the passwords.

Nvidia, with thousands of engineers, is still being asked who could step in. Most small businesses have a much thinner bench.

A few questions worth asking about your own company:

- **If your key person were out for 90 days, what would stop?** Write the list. That list is your key-person risk.
- **Is the knowledge written down?** Processes, pricing logic, vendor contacts and system access should live somewhere other than one person's head.
- **Who can make decisions when that person can't?** A named backup with real authority beats an org chart.

## Our take: the social engineering lesson

Whatever the investigation finds, the alleged method is worth understanding. It isn't malware or a breached firewall. It's building a close personal relationship with someone who has access.

That playbook is old, and it doesn't only target billionaires. Small businesses see the same idea at smaller scale: the friendly "vendor" who asks for a copy of the bid, the new contact who wants to move a payment to a different account, the caller who already knows your project names. Attackers go after people because people have access.

The practical defenses are boring and effective. Verify payment and banking changes by calling a number you already have. Limit who can see pricing, contracts and client data. Make it normal for staff to say, "Let me confirm that and call you back."

## Our take: what it means for businesses buying AI hardware

For most U.S. businesses buying GPUs or AI servers, nothing changes this week. The board says Huang stays on, the company says it "will not slow," and no supply disruption has been announced.[^ap] In South Korea, the deputy science minister said the government expects no disruption to contracted Nvidia GPU deliveries.[^reuters]

What could matter over the coming months:

- **Export controls.** Raymond James analysts wrote that the allegations will likely strengthen support in Congress for tighter limits on chip sales to China.[^ap] Those rules mostly target exports, but policy shifts can ripple into pricing and availability elsewhere.
- **Leadership uncertainty.** Analysts at Rothschild & Co. Redburn said Huang could be forced to step back only if the investigation finds "something materially more serious," and that a resignation is not a foregone conclusion.[^cnbc-succession]
- **Slower decisions.** Analysts told Reuters a prolonged investigation could delay Nvidia's investment decisions or product launches. One also noted Nvidia's products would be hard to replace, which limits the impact, and that rivals such as AMD could draw more attention in the short term.[^reuters]
- **Single-vendor dependence.** If your AI plans assume one supplier's hardware, one software stack and one delivery timeline, this is a reminder to know your alternatives. That doesn't mean switching. It means knowing what you'd do if prices, lead times or support terms changed.

If you're planning a private AI system, like the eight-GPU server we covered in [our look at a lawyer's private AI build](/blog/lawyer-private-ai-server-used-v100-gpus), build the plan around the workload, not the brand. Know which models you'll run, what hardware they actually need and which alternatives would work.

## What to watch

- **The investigation's findings.** The board says it will provide updates "as appropriate."[^nvidia-board]
- **The FBI.** Whether the bureau or the Justice Department says anything about the scope Trump described.[^ap-fbi]
- **November 17 earnings.** Nvidia reports third-quarter results; watch for any comment on leadership, governance or China.[^cnbc]
- **November 18.** Three House Republican committee chairs have asked Huang for a closed-door briefing on Nvidia's security protocols.[^cnbc][^bbc]
- **Export-control legislation.** Any new limits on chip sales to China.[^ap]

The story will keep moving. We'll update this article when the investigation, Nvidia or Congress adds something material.`,
  },
  // ── First AI News piece · published on its release date. Every figure below
  //    was checked against the listed sources on 2026-11-09 and rechecked for
  //    pricing/availability news before release. Set updatedAt on any change.
  {
    slug: "smartsheet-vsactual-execution-drift-ai-agents",
    title: "Smartsheet Built AI Agents to Catch \"Execution Drift.\" Here's What Operators Should Ask Before Trusting Them.",
    status: "published",
    publishedAt: "2026-11-09",
    category: "ai-news",
    secondaryCategories: ["business-automation"],
    seo: {
      title: "Smartsheet vsActual: AI Agents That Watch for Execution Drift",
      description:
        "Smartsheet's new vsActual uses AI agents to flag when work drifts from the plan. What was announced, what's still unclear, and what operators should ask first.",
    },
    summary:
      "Smartsheet's new vsActual reads across the systems a company already runs on and flags budget, schedule and staffing drift before the quarterly review. The idea is sound. Whether it works depends on the plan, the data and the permissions you give its agents.",
    tags: ["Smartsheet", "vsActual", "AI agents", "Execution drift", "PMO", "Project controls", "Operations"],
    hero: {
      src: "/blog/smartsheet-vsactual-execution-drift.webp",
      alt: "A job-site project office: a monitor shows a project schedule where actual progress bars trail the planned bars and a red alert reads Behind Plan by 3.5 weeks. A whiteboard lists recovery priorities, with a hard hat, safety vest and drawings on the desk and a building frame under construction outside the window.",
      caption: "Illustration only. Not a Smartsheet or vsActual screen; the schedule and figures are invented.",
      // Provenance: generated in ChatGPT for Tomorrow's Tech AI from our prompt (2026-11-09).
      credit: "AI-generated illustration: Tomorrow’s Tech AI Solutions",
    },
    cta: {
      service: "command-centers",
      label: "Catch drift without an enterprise rollout",
      blurb:
        "We build Smartsheet-based command centers with baselines, variance flags and readiness checks, so schedule, budget and crew problems show up while they're still fixable.",
    },
    sources: [
      {
        id: "smartsheet-pr",
        title: "Smartsheet Unveils vsActual: The AI-Powered Future of Work Execution at ENGAGE 2026",
        publisher: "Smartsheet",
        url: "https://www.smartsheet.com/content-center/news/smartsheet-unveils-vsactual-ai-powered-future-work-execution-engage-2026",
        publishedAt: "2026-11-04",
        accessedAt: "2026-11-09",
        kind: "vendor",
        note: "The company's own announcement. Capability descriptions are Smartsheet's claims.",
      },
      {
        id: "computerworld",
        title: "Smartsheet's new AI tool tracks corporate strategies, suggests fixes",
        publisher: "Computerworld",
        author: "Matthew Finnegan",
        url: "https://www.computerworld.com/article/4245034/smartsheets-new-ai-tool-tracks-corporate-strategies-suggests-fixes.html",
        publishedAt: "2026-11-05",
        accessedAt: "2026-11-09",
        kind: "secondary",
        note: "Includes comment from Liz Miller, Constellation Research, and availability and pricing details confirmed by Smartsheet.",
      },
      {
        id: "futurum",
        title: "Can Smartsheet vsActual Close the Gap Between Strategy and Execution?",
        publisher: "The Futurum Group",
        author: "Keith Kirkpatrick",
        url: "https://futurumgroup.com/insights/can-smartsheet-vsactual-close-the-gap-between-strategy-and-execution/",
        publishedAt: "2026-11-04",
        accessedAt: "2026-11-09",
        kind: "secondary",
        note: "Analyst account of the ENGAGE 2026 keynote demo and customer remarks. Futurum discloses AI-assisted writing and advisory work with technology vendors.",
      },
      {
        id: "itbrief",
        title: "Smartsheet tackles execution drift in the age of AI agents",
        publisher: "IT Brief Australia",
        author: "Anthony Caruana",
        url: "https://itbrief.com.au/story/smartsheet-tackles-execution-drift-in-the-age-of-ai-agents",
        publishedAt: "2026-11-06",
        accessedAt: "2026-11-09",
        kind: "secondary",
        note: "Interview with Jarrod Kinchington, Smartsheet's APAC leader.",
      },
    ],
    specs: [
      { label: "Announced", value: "November 4, 2026, at Smartsheet's ENGAGE 2026 conference", sourceIds: ["smartsheet-pr", "futurum"], verified: true },
      { label: "What it is", value: "A standalone AI planning and execution app, sold separately from Smartsheet's core product", sourceIds: ["computerworld", "futurum"], verified: true },
      { label: "Systems it reads from", value: "Oracle, SAP, Workday, Salesforce, Jira, ServiceNow, Smartsheet; Slack per Computerworld", sourceIds: ["smartsheet-pr", "computerworld"], verified: false, note: "As described by Smartsheet and Computerworld; not tested by us." },
      { label: "Agents", value: "Intake, planning, drift, data quality and reporting agents", sourceIds: ["computerworld"], verified: false },
      { label: "Human control", value: "Agents can't change the plan of record on their own; human approval is the default", sourceIds: ["smartsheet-pr", "computerworld"], verified: false, note: "Computerworld reports agents can act autonomously when given permissions." },
      { label: "Availability", value: "Early access now; general availability planned for early 2027", sourceIds: ["computerworld"], verified: false },
      { label: "Pricing", value: "Not disclosed; usage-based billing", sourceIds: ["computerworld"], verified: false },
      { label: "Design partners", value: "12 enterprise design partners", sourceIds: ["futurum"], verified: false },
    ],
    discrepancies: [
      {
        topic: "Can vsActual's agents act without a person approving it?",
        accounts: [
          { sourceId: "smartsheet-pr", claim: "Every recommendation comes with its reasoning so leaders can check it before acting, and agents can't change the plan on their own." },
          { sourceId: "futurum", claim: "Agents gather data, flag drift and draft summaries, and a human approves every change." },
          { sourceId: "computerworld", claim: "Agents can act autonomously, including updating data in third-party applications, when given the relevant permissions. Human approval is required by default." },
        ],
        resolution: "These can all be true at once: the plan of record is protected, approval is the default, and permissions can apparently allow agents to update other systems. We read it as configurable, not guaranteed, and suggest asking exactly which actions can run without approval.",
      },
      {
        topic: "Have pricing and availability been announced?",
        accounts: [
          { sourceId: "futurum", claim: "Pricing and availability were not disclosed." },
          { sourceId: "computerworld", claim: "vsActual is in early access with general availability planned for early 2027; pricing was not disclosed, but Smartsheet confirmed usage-based billing." },
        ],
        resolution: "Computerworld's report came a day later and cites Smartsheet's confirmation. We report its details as reported, not announced.",
      },
    ],
    body: `Anyone who has run projects knows the moment. The status report says green. The superintendent's text says the crew never showed. By the time the two meet in a monthly review, the slip is three weeks old and expensive.

Smartsheet now has a name for that gap, "execution drift," and a product built to catch it. On November 4, at its ENGAGE 2026 conference, the company announced vsActual, an AI planning and execution app whose agents read across the systems a business already runs on and flag budget, schedule and staffing problems as they appear.[^smartsheet-pr]

It is the first big swing from a work-management platform at a problem operations people have handled by hand for decades. Here's what was announced, what's still unclear, and what to ask before trusting it.

## What was announced

| Item | What we know | Source |
|:--|:--|:--|
| Launch | Announced November 4, 2026, at ENGAGE 2026 | Smartsheet[^smartsheet-pr] |
| Product | Standalone app, separate from Smartsheet's core software | Computerworld, Futurum[^computerworld][^futurum] |
| Data it reads | Oracle, SAP, Workday, Salesforce, Jira, ServiceNow and more | Smartsheet[^smartsheet-pr] |
| Availability | Early access; general availability planned for early 2027 | Computerworld (reported)[^computerworld] |
| Pricing | Not disclosed; usage-based billing | Computerworld (reported)[^computerworld] |

## How it's supposed to work

vsActual starts with the plan. Its AI takes a company's strategy from wherever it lives (decks, budget memos, spreadsheets) and turns it into a single "plan of record" with goals, timelines and limits on budget and capacity. New requests are scored against that plan, and leaders can model scenarios before picking one.[^smartsheet-pr]

From there, agents do the watching. Computerworld describes an intake agent, a planning agent, a drift agent that continuously looks for budget overruns, schedule delays and resource conflicts, plus data-quality and reporting agents. The drift agent draws on connected apps, including conversations in Slack, and can recommend fixes such as adding staff to a project heading for a delay.[^computerworld]

Underneath is what Smartsheet calls the Execution Graph, a map of how tasks, projects, programs and goals connect, built on 20 years of workflow data. Smartsheet says agents can see and change only what the person they work for can.[^smartsheet-pr]

The keynote demo, as described by Futurum analyst Keith Kirkpatrick, showed the pitch end to end. From a strategy deck, a budget spreadsheet and headcount data, vsActual scored 45 proposed initiatives against a $42 million budget and funded 37. Six weeks into the quarter, it caught a nine-week slip on a project that Jira still showed as green. Once a person approved a recovery option, it pushed the change into Smartsheet, Jira, ServiceNow, Workday and Slack.[^futurum]

That is a demo, not a deployment. Smartsheet has acknowledged that customers with weak planning data won't get the results shown on stage.[^futurum]

> [!NOTE] Reporting and analysis
> Sections headed "Our take" are Tomorrow's Tech AI's own analysis, based on our work building project-controls and operations systems. Everything else is attributed to the sources listed below.

## Who it's for

This is aimed high. Liz Miller of Constellation Research told Computerworld the product targets the C-suite, specifically CFOs and COOs fighting budget creep and timeline drift, which today usually surfaces in quarterly slide decks and emailed spreadsheets.[^computerworld]

That puts vsActual up against planning platforms such as Planview, ServiceNow's strategic portfolio tools, Workday Adaptive Planning and Anaplan, not the project trackers Smartsheet is known for. Kirkpatrick called the concept sound but noted that the launch asks Smartsheet to sell to a new buyer, with a product unlike the one it's known for.[^futurum]

Smartsheet's APAC leader, Jarrod Kinchington, framed the split this way: teams keep running the live work in Smartsheet, and vsActual reports upward on whether that work is hitting the goals.[^itbrief]

## The fine print on "people stay in control"

Smartsheet's announcement says every recommendation comes with its reasoning so leaders can check it before acting, and that agents can't change the plan on their own.[^smartsheet-pr] Futurum's account of the demo says a human approves every change.[^futurum]

Computerworld adds a detail that matters: vsActual's agents can act autonomously, including updating data in third-party applications, when they're given the relevant permissions. Human approval is required by default.[^computerworld]

Those statements don't necessarily conflict. The plan of record is protected, and approval is the default setting. But a default is a setting, and settings change. Before a drift agent can write to your scheduling, HR or finance systems, someone should know exactly which actions run without a person signing off.

## Our take: the idea isn't new. Automating it is.

Catching drift early is what good project controls have always been about: baseline the schedule, track variance, flag the crew that isn't approved or the job that isn't ready before work is assigned, not after. The best PMO teams do this today with disciplined trackers and someone who reads them every morning.

What vsActual changes is the reading. Instead of a person reconciling five systems before the weekly meeting, agents do it continuously. That is valuable, but it raises the stakes on everything the agents read.

Three cautions from the launch coverage are worth taking seriously:

- **Bad data gets worse, faster.** A planning lead from Eli Lilly, speaking at ENGAGE, put it this way: AI "does not fix operational inconsistencies; it intensifies them."[^futurum]
- **Status is often subjective.** Smartsheet's own CEO, relaying what Fortune 500 CIOs told him, described red-yellow-green reports that every project manager scores differently.[^futurum] A drift agent reading inconsistent status will produce confident, inconsistent answers.
- **Guardrails come first.** Miller advised that agents be tested, trained and grounded before working autonomously, with a clear path for human intervention.[^computerworld]

In field operations, much of the drift never reaches an ERP. It lives in a foreman's text, a missed inspection or a crew that quietly moved to another job. A tool can only flag what someone records.

## Our take: five questions to ask before you turn drift agents loose

1. **What exactly is "the plan"?** vsActual depends on a single plan of record. If finance, operations and the field don't agree on one, the agent will measure against the wrong thing.
2. **Which systems can it write to?** List them. Then list which writes need approval and who approves them.
3. **Is approval required, or just the default?** Find out who in your organization can change that setting.
4. **Is your status data honest?** Standardize what green, yellow and red mean before an agent starts summarizing them for executives.
5. **What will usage cost?** Billing is reported to be usage-based.[^computerworld] Ask how agent activity is metered before you let it run continuously.

## You don't need an enterprise platform to start

vsActual is built for large organizations and isn't generally available until early 2027.[^computerworld] Most small and mid-sized operators don't need to wait for it.

The discipline behind it can be built in the tools many teams already use: baselined schedules, variance columns, readiness checks and alerts that fire when a date slips, with AI layered on to summarize and flag. We covered one way to put AI on top of Smartsheet data in [our look at Claude's Smartsheet integration](/blog/smartsheet-claude-mcp).

## What to watch

- **Pricing.** Usage-based billing is reported; the actual numbers are not public.[^computerworld]
- **Customer results.** Design partners such as Advanced Drainage Systems and Avid Technology spoke at ENGAGE; measurable results haven't been published.[^futurum]
- **Agent permissions in practice.** How customers configure autonomy versus approval will say more than any keynote.
- **The competition.** Kirkpatrick expects ServiceNow, Planview and Workday to sharpen their own AI planning pitches to PMO and finance buyers.[^futurum]

Execution drift isn't a new problem. Software that watches for it all day, and can act on what it finds, is. The companies that get value from it will be the ones that fix the plan and the data before they turn the agents on.`,
  },
  // ── Second flagship · published on its release date. Every figure below
  //    was checked against the listed sources on 2026-11-09 and rechecked for
  //    newer developments before release. Set updatedAt on any later change.
  {
    slug: "spacex-telecom-acquisition",
    title: "SpaceX's Next Big Move: Is Elon Musk Preparing to Buy a Telecom Giant?",
    status: "published",
    publishedAt: "2026-11-09",
    category: "industry-insights",
    seo: {
      title: "Is SpaceX Preparing to Buy a Telecom Giant?",
      description:
        "Musk says SpaceX could buy a legacy carrier for its spectrum. What's confirmed, what's only reported, and what it means for towers, fiber and telecom contractors.",
    },
    summary:
      "Elon Musk says SpaceX could buy an established carrier to use its spectrum. Add billions in spectrum deals, reported talks over Boost Mobile and a search for tower partners, and a bigger question comes into view: what happens when a satellite company decides to become a wireless operator?",
    tags: ["SpaceX", "Starlink Mobile", "Telecommunications", "Wireless spectrum", "EchoStar", "Cell towers", "Fiber", "Telecom contractors"],
    hero: {
      src: "/blog/spacex-telecom-illustration.webp",
      alt: "Illustration of a rocket on a launch pad, satellites linked by light beams above a night-side Earth, a cell tower and a smartphone showing 5G, with a city skyline at sunset.",
      caption: "Illustration only. Not an official SpaceX image and not a depiction of any specific network.",
      // Provenance: embedded C2PA record (ChatGPT, gpt-image; IPTC trainedAlgorithmicMedia).
      credit: "AI-generated illustration: Tomorrow’s Tech AI Solutions",
    },
    cta: {
      service: "telecom-technology",
      label: "Telecom software, automation and AI",
      blurb:
        "We build field-ops software, workflow automation and AI tools for telecom contractors, infrastructure owners and operators.",
    },
    sources: [
      {
        id: "marketwatch",
        title: "Elon Musk opens the door for a big SpaceX acquisition",
        publisher: "MarketWatch",
        author: "William Gavin",
        url: "https://www.marketwatch.com/story/elon-musk-opens-the-door-for-a-big-spacex-acquisition-4f62bcad",
        publishedAt: "2026-11-06",
        accessedAt: "2026-11-09",
        kind: "secondary",
        note: "Reports Musk's remarks at Baron Capital's annual investment conference and analyst views.",
      },
      {
        id: "reuters-boost",
        title: "SpaceX in talks to buy Boost Mobile or use its network, Washington Post reports",
        publisher: "Reuters (via Investing.com)",
        url: "https://www.investing.com/news/stock-market-news/spacex-in-talks-to-buy-boost-mobile-or-use-its-network-washington-post-reports-4990666",
        publishedAt: "2026-11-02",
        accessedAt: "2026-11-09",
        kind: "secondary",
        note: "Reuters summary of a Washington Post report citing people familiar with the negotiations.",
      },
      {
        id: "reuters-spectrum",
        title: "SpaceX takes aim at US wireless carriers with spectrum acquisition",
        publisher: "Reuters (via Investing.com)",
        author: "Akash Sriram and David Shepardson",
        url: "https://www.investing.com/news/stock-market-news/spacex-to-acquire-spectrum-that-enables-starlink-mobile-services-4939769",
        publishedAt: "2026-10-08",
        accessedAt: "2026-11-09",
        kind: "secondary",
      },
      {
        id: "echostar-10q",
        title: "EchoStar Corporation Form 10-Q for the quarter ended September 30, 2026",
        publisher: "U.S. Securities and Exchange Commission (EDGAR)",
        url: "https://www.sec.gov/Archives/edgar/data/1415404/000110465926121675/sats-20260930x10q.htm",
        accessedAt: "2026-11-09",
        kind: "primary",
        note: "EchoStar's own description of the SpaceX spectrum transactions, approvals and closing timeline.",
      },
      {
        id: "insidetowers",
        title: "SpaceX Seeks Tower Industry Partners",
        publisher: "Inside Towers",
        author: "Martha DeGrasse",
        url: "https://insidetowers.com/spacex-seeks-tower-industry-partners/",
        publishedAt: "2026-11-02",
        accessedAt: "2026-11-09",
        kind: "secondary",
        note: "Based on conversations with tower and site acquisition executives.",
      },
      {
        id: "axios",
        title: "AT&T CEO says Elon Musk's SpaceX phone strategy not \"viable\"",
        publisher: "Axios",
        author: "Nathan Bomey",
        url: "https://www.axios.com/2026/09/29/att-ceo-john-stankey-spacex-elon-musk",
        publishedAt: "2026-09-29",
        accessedAt: "2026-11-09",
        kind: "secondary",
      },
    ],
    specs: [
      { label: "EchoStar AWS-4 and H-Block (50 MHz)", value: "$17 billion, agreed September 7, 2025", note: "Part of the price pays off EchoStar debt; up to $8.5 billion in SpaceX stock, the rest in cash.", sourceIds: ["echostar-10q"], verified: true },
      { label: "EchoStar AWS-3 (up to 15 MHz)", value: "$2.6 billion in SpaceX stock, added November 5, 2025", note: "Brings the EchoStar deals to about $20 billion.", sourceIds: ["echostar-10q"], verified: true },
      { label: "EchoStar deal status", value: "FCC-approved May 12, 2026; licenses moved to a trust May 22, 2026; final transfer to SpaceX targeted for November 30, 2027", sourceIds: ["echostar-10q"], verified: true },
      { label: "Grain Management 800 MHz (up to 14 MHz paired)", value: "About $8 billion, agreed October 2026", note: "Price reported, not disclosed by the companies. Subject to FCC approval.", sourceIds: ["reuters-spectrum", "insidetowers"], verified: false },
      { label: "Boost Mobile", value: "Talks to buy it or use its network", note: "Reported by The Washington Post via Reuters. No agreement announced.", sourceIds: ["reuters-boost"], verified: false },
      { label: "EchoStar wireless subscribers", value: "7.38 million at the end of Q2 2026", note: "Mostly Boost Mobile and Gen Mobile customers.", sourceIds: ["reuters-boost"], verified: false },
      { label: "Cell sites sought", value: "Access to up to 80,000 U.S. sites", note: "Bloomberg report, as cited by Inside Towers.", sourceIds: ["insidetowers"], verified: false },
      { label: "Starlink scale (June 30, 2026)", value: "12 million subscribers; 10,200 satellites; 167 countries", note: "From SpaceX's first earnings report as a public company.", sourceIds: ["axios"], verified: false },
      { label: "Wireless service target", value: "Initial service early 2028", note: "SpaceX's stated expectation.", sourceIds: ["marketwatch"], verified: false },
    ],
    discrepancies: [
      {
        topic: "Is the $8 billion price for the 800 MHz spectrum confirmed?",
        accounts: [
          { sourceId: "reuters-spectrum", claim: "Says financial terms were not disclosed and attributes the roughly $8 billion figure to Wall Street Journal reporting citing people familiar with the matter." },
          { sourceId: "insidetowers", claim: "States that SpaceX agreed to pay Grain Management $8 billion for up to 14 MHz of paired 800 MHz spectrum." },
        ],
        resolution: "We describe the price as reported. Neither company has disclosed the terms in the sources we reviewed.",
      },
    ],
    body: `The rockets get the headlines. The telecommunications infrastructure on the ground could decide what happens next.

On November 6, Elon Musk told investor Ron Baron that SpaceX might one day buy an established carrier outright. Speaking at Baron Capital's annual investment conference, he said that if SpaceX can use spectrum better than a legacy telco does, "we can just acquire that legacy telco and use their spectrum."[^marketwatch]

No acquisition was announced, and Musk did not name a target.[^marketwatch] But the remark lands on top of a year of very real moves. For anyone who has worked inside telecom construction and operations, this one is worth following closely.

## Where things stand

The story mixes signed deals, reported talks and opinion. Here is how each piece stands as of November 9, 2026:

| Development | Status | Source |
|:--|:--|:--|
| EchoStar spectrum sale to SpaceX (about $20 billion) | Agreed and FCC-approved; final transfer targeted for Nov. 2027 | EchoStar filing[^echostar-10q] |
| 800 MHz spectrum from Grain Management (about $8 billion) | Agreed; price reported; FCC approval required | Reuters, Inside Towers[^reuters-spectrum][^insidetowers] |
| Buying Boost Mobile or using its network | Reported talks; no agreement announced | Reuters, citing The Washington Post[^reuters-boost] |
| Access to cell towers and contractor crews | Request for information sent; reported tower talks | Inside Towers[^insidetowers] |
| Buying a legacy carrier | Musk's remark; no target named | MarketWatch[^marketwatch] |

## SpaceX is already moving into traditional telecom

Starlink began as satellite broadband. It has grown into SpaceX's largest business: connectivity made up 55% of sales, and Starlink had 12 million subscribers as of June 30, according to the company's first earnings report since going public.[^axios]

The mobile push is now explicit. SpaceX expects to switch on initial wireless service, combining satellite and ground-based coverage, in early 2028.[^marketwatch]

**The EchoStar spectrum is the confirmed foundation.** In September 2025, SpaceX agreed to buy EchoStar's AWS-4 and H-Block licenses, 50 MHz of spectrum, for $17 billion. A November 2025 amendment added AWS-3 spectrum for another $2.6 billion in SpaceX stock, bringing the total to about $20 billion. The FCC approved the deals on May 12, 2026, and the licenses moved into a trust on May 22. The final transfer to SpaceX is targeted for November 30, 2027, subject to closing conditions.[^echostar-10q]

**The 800 MHz deal adds reach.** In October 2026, SpaceX agreed to buy a nationwide 800 MHz spectrum portfolio from private-equity firm Grain Management. The price was reported at about $8 billion, the deal needs FCC approval, and Grain had bought the airwaves from T-Mobile earlier in the year.[^reuters-spectrum] Low-band spectrum travels farther and passes through walls and trees better, one of the weak spots for satellite-to-phone service. Most existing phones already support the band.[^reuters-spectrum]

Owning spectrum is not the same as running a nationwide network, though. Verizon's spokesman put it bluntly: without the network to use it, it's "just empty airwaves."[^reuters-spectrum]

That gap is why an acquisition keeps coming up.

> [!NOTE] Reporting and analysis
> Sections headed "Our take" are Tomorrow's Tech AI's own analysis, drawing on our experience in telecom infrastructure. They describe possibilities, not reported plans.

## Our take: why buying a telecom company could make sense

Imagine building a national wireless business from scratch. Satellites and radio licenses are only the start. You also need:

- **Spectrum** in the right bands and markets.
- **Terrestrial sites:** towers, rooftops, small cells, antennas and power.
- **Fiber and backhaul** to carry traffic from sites to the core network and the internet.
- **Customers:** subscriber relationships and enterprise contracts.
- **Operations:** billing, provisioning, customer care, network management and vendor relationships.
- **Commercial plumbing:** retail distribution, roaming and interconnection agreements.

An established operator brings years, sometimes decades, of that investment at once. Analysts have made the same point: Citi has said buying a major carrier could let SpaceX launch a full Starlink Mobile service years ahead of current expectations.[^marketwatch]

The value would depend on the specifics: which assets the target actually owns, its debt, its contracts, its regulatory obligations and the condition of its network.

## Boost Mobile is already part of the conversation

This is not purely hypothetical. On November 2, Reuters reported, citing The Washington Post, that SpaceX was in talks to buy EchoStar's Boost Mobile or gain access to its network. Musk reportedly met EchoStar chairman Charlie Ergen in October.[^reuters-boost]

Boost would bring customers. EchoStar had 7.38 million wireless subscribers at the end of the second quarter, mostly Boost Mobile and Gen Mobile.[^reuters-boost] EchoStar's own filing already provides for future commercial agreements that would give its wireless subscribers access to Starlink's direct-to-cell services.[^echostar-10q]

There is a catch. Boost leases network capacity from AT&T and T-Mobile, and those agreements may not transfer to a new owner without the carriers' consent.[^reuters-boost] Buying a customer base is not the same as owning the network that serves it.

Analysts are already speculating about bigger targets. BNP Paribas suggested SpaceX's visible push is meant to pressure one of the three national carriers into a network-access deal, and TD Cowen has called T-Mobile the "clear choice" among them.[^marketwatch] Those are opinions, not reported negotiations.

## The infrastructure question

Here is the part we find most interesting. Wireless networks run on assets the customer never sees: fiber routes, metro rings, backhaul, equipment shelters, rights-of-way, easements and collocation agreements. They take years of engineering, permitting and construction to build.

SpaceX appears to know it. In late October, Bloomberg reported that SpaceX wants access to up to 80,000 U.S. cell sites. Inside Towers then reported that SpaceX had sent a request for information to contractors, site acquisition firms and tower owners. It names more than 20 U.S. markets, treats Southern California as an early test market, and asks contractors how many crews they could commit in certain areas.[^insidetowers] SpaceX also said it would work with Qualcomm on the ground-based infrastructure for its network.[^marketwatch]

SpaceX does not have to buy fiber or towers to get there. It can lease space, buy wholesale transport or sign partnerships. Either way, the work has to be done by someone.

## Our take: what this could mean for regional operators and contractors

The United States has many regional telecom businesses: rural broadband providers, fiber owners, enterprise carriers, tower and small-cell owners, and the construction firms that build and maintain all of it.

A new entrant building at speed could make some of those assets more valuable. A few could become partners or acquisition candidates. Far more could see demand for the work itself: site acquisition, tower and small-cell installs, fiber construction and splicing, backhaul, integration and ongoing maintenance. The RFI's question about crew counts is an early signal of that.[^insidetowers]

Not every operator would be attractive. Spectrum, coverage, network quality, customer economics, costs and regulatory obligations all shape value. And none of this is guaranteed: it depends on SpaceX actually building at scale.

## Why SpaceX still faces major obstacles

Spectrum and ambition do not make SpaceX a replacement for AT&T, Verizon or T-Mobile.

- **Skeptical incumbents.** AT&T CEO John Stankey called SpaceX's phone strategy "not a viable strategy" and argued that SpaceX's plan to put small cells next to Starlink dishes would cost as much as building a conventional network.[^axios]
- **Indoor coverage and capacity.** Satellite signals struggle indoors and in dense cities. Bernstein's Madison Rezaei wrote that Starlink Mobile may fill gaps in remote and rural areas but is "a long way" from replacing terrestrial networks.[^axios]
- **Cost.** One analyst estimated a traditional terrestrial build could cost over $100 billion.[^axios]
- **Deal complexity.** Buying a carrier brings debt, contracts, integration work and regulatory and competitive review.

One more wrinkle: tower executives quoted by Inside Towers doubted Musk would pay going lease rates long term, expecting him to push for something more disruptive.[^insidetowers]

## Our take: is this the start of a new consolidation cycle?

Telecom consolidation has usually meant carriers buying carriers, tower companies rolling up regional networks, or investment firms combining assets. SpaceX would be a different kind of buyer: a satellite operator with its own launch capability and, since its IPO, public-market currency.[^axios]

If it makes a major acquisition, other technology and infrastructure companies may rethink how they compete in telecom. That is a possible outcome, not a trend yet. What is already clear is that the line between satellite connectivity and conventional telecom is moving.

## What telecom owners and industry leaders should watch

1. Whether SpaceX announces an acquisition or network-access deal with an established carrier.
2. Whether the reported Boost Mobile talks produce an agreement.
3. FCC action on the 800 MHz purchase.
4. How SpaceX secures cell sites, backhaul and crews, and on what terms.
5. How AT&T, Verizon and T-Mobile respond with their own investments and partnerships.
6. Whether regional operators and contractors see new commercial work.

For owners of telecom infrastructure, it is a reminder that a network's strategic value can reach beyond its current revenue: its geography, physical assets, rights-of-way and customer relationships all matter to potential partners and buyers.

## The infrastructure could decide the outcome

SpaceX has already changed the economics of putting hardware into orbit. Now it is chasing a much bigger role on the ground. Whether that means buying a legacy operator, building its own terrestrial layer or signing partnerships remains to be seen.

Existing telecom infrastructure still matters, even in an increasingly satellite-connected world. For those of us who know the engineering, construction and operational work behind these networks, that is what makes this story worth watching.

Tomorrow's Tech AI builds software, workflow automation and AI tools for telecom contractors, infrastructure owners and operators: field-ops and crew tracking, project and permitting workflows, network documentation and AI that works with your own data. If you're planning for the next wave of network work, [talk with us about your telecom operations](/contact?service=telecom-technology&from=/blog/spacex-telecom-acquisition&cta=body).`,
  },
  // ── Phase 5 flagship · published on its release (deployment) date.
  //    Every figure below was checked against the listed sources on
  //    2026-11-09. Set updatedAt on any later factual change.
  {
    slug: "lawyer-private-ai-server-used-v100-gpus",
    title: "A Lawyer Built His Own Private AI Server. Here's Why Every Business Should Pay Attention.",
    status: "published",
    publishedAt: "2026-11-09",
    category: "private-ai",
    secondaryCategories: ["hardware"],
    featured: true,
    seo: {
      title: "A Lawyer Built His Own Private AI Server: What It Means for Business",
      description:
        "A South Carolina trial lawyer runs a large open AI model on eight used NVIDIA V100 GPUs so case files stay in his office. What it cost, how it performs, and what it means for any business with data it can't share.",
    },
    summary:
      "A South Carolina trial lawyer turned eight used data-center GPUs into an AI server that reads his case files without sending them anywhere. The build is rough around the edges. The idea behind it applies to any business with information it can't afford to share.",
    tags: ["Private AI", "Local AI", "NVIDIA V100", "DeepSeek", "Legal tech", "Data privacy"],
    hero: {
      src: "/blog/lawyer-private-ai-server-illustration.webp",
      alt: "Illustration of an open server chassis holding eight NVIDIA Tesla V100 graphics cards in two stacks of four, with braided power cables and a motherboard behind them.",
      caption:
        "Illustrative recreation, not a photo of Nick Mermiges's server. His build uses SXM2 GPU modules on two NVLink boards rather than the PCIe cards shown.",
      // Provenance: embedded C2PA record (ChatGPT, gpt-image; IPTC trainedAlgorithmicMedia).
      credit: "AI-generated illustration: Tomorrow’s Tech AI Solutions",
    },
    sources: [
      {
        id: "homelab-post",
        title: "Lawyer's V100 homelab, update: two 4-card SXM2 NVLink boards, four PEX switches, SlimSAS everywhere, one burnt power connector, and a 250 GB model running entirely in VRAM at 200+ tok/s",
        publisher: "Reddit, r/homelab",
        author: "u/TumbleweedNew6515",
        url: "https://www.reddit.com/r/homelab/comments/1xoumr9/lawyers_v100_homelab_update_two_4card_sxm2_nvlink/",
        publishedAt: "2026-11-05",
        accessedAt: "2026-11-09",
        kind: "primary",
        note: "The builder's own write-up. Read as embedded in the Tom's Hardware article; the post's title predates the builder's correction about system RAM.",
      },
      {
        id: "github",
        title: "Volta-sPLIt: DeepSeek-V4.1-Flash on 8x V100-SXM2 (PP2 x TP4), build notes and benchmarks",
        publisher: "GitHub, ProprietaryLegal",
        url: "https://github.com/ProprietaryLegal/Volta-sPLIt-DeepSeek-V4.1-Flash-1017-8xV100-SXM2-PP2xTP4",
        accessedAt: "2026-11-09",
        kind: "primary",
        note: "The builder's published configuration and full benchmark tables.",
      },
      {
        id: "toms",
        title: "Lawyer builds private AI server with eight used Nvidia V100 GPUs",
        publisher: "Tom's Hardware",
        author: "Shane Downing",
        url: "https://www.tomshardware.com/tech-industry/artificial-intelligence/lawyer-builds-private-ai-server-with-eight-used-nvidia-v100-gpus-up-to-215-tokens-per-second-to-keep-legal-files-offline-costing-about-usd2-400-per-four-gpu-board",
        publishedAt: "2026-11-09",
        accessedAt: "2026-11-09",
        kind: "secondary",
      },
      {
        id: "toms-forum",
        title: "Comments by the builder on the Tom's Hardware article",
        publisher: "Tom's Hardware forums",
        url: "https://forums.tomshardware.com/threads/lawyer-builds-private-ai-server-with-eight-used-nvidia-v100-gpus.3902115/",
        accessedAt: "2026-11-09",
        kind: "primary",
        note: "The builder identifies himself and describes his plans for a fully offline setup.",
      },
      {
        id: "pli",
        title: "Proprietary Legal Intelligence: about the founder",
        publisher: "Proprietary Legal Intelligence",
        url: "https://proprietarylegal.ai/",
        accessedAt: "2026-11-09",
        kind: "primary",
      },
      {
        id: "nvidia",
        title: "CUDA Toolkit, Driver, and Architecture Matrix",
        publisher: "NVIDIA",
        url: "https://docs.nvidia.com/datacenter/tesla/drivers/cuda-toolkit-driver-and-architecture-matrix.html",
        accessedAt: "2026-11-09",
        kind: "vendor",
      },
      {
        id: "aba",
        title: "ABA issues first ethics guidance on a lawyer's use of AI tools",
        publisher: "American Bar Association",
        url: "https://www.americanbar.org/news/abanews/aba-news-archives/2024/07/aba-issues-first-ethics-guidance-ai-tools/",
        accessedAt: "2026-11-09",
        kind: "primary",
        note: "Announces ABA Formal Opinion 512, issued July 29, 2024.",
      },
      {
        id: "ncbex",
        title: "Generative Artificial Intelligence Tools: ABA Formal Opinion 512 Provides Needed Guidance",
        publisher: "The Bar Examiner (NCBE)",
        url: "https://thebarexaminer.ncbex.org/article/fall-2024/generative-artificial-intelligence-tools/",
        accessedAt: "2026-11-09",
        kind: "secondary",
      },
    ],
    specs: [
      { label: "GPUs", value: "8× NVIDIA Tesla V100-SXM2, 32 GB HBM2 each (2018 data-center cards)", sourceIds: ["homelab-post", "toms"], verified: true },
      { label: "GPU layout", value: "Two 4-GPU SXM2 boards; NVLink inside each board (128 GB per board), PCIe between boards", sourceIds: ["homelab-post", "toms"], verified: true },
      { label: "Cost per 128 GB board", value: "About $2,400 (four cards ~$1,600, board and switch card ~$750)", note: "The builder's purchase prices. Tom's Hardware found used cards listed at about $900 each by November 2026.", sourceIds: ["homelab-post", "toms"], verified: true },
      { label: "Host", value: "Threadripper PRO 3945WX (12 cores), 8× 32 GB DDR4 RDIMM", sourceIds: ["homelab-post", "toms"], verified: true },
      { label: "Power", value: "Two PSUs, 2,800 W total, on two ordinary office circuits; each GPU capped at 150 W", sourceIds: ["homelab-post", "toms"], verified: true },
      { label: "Model", value: "DeepSeek-V4.1-Flash, mostly 2-bit, 248.8 GB of weights; 524K-token context", sourceIds: ["homelab-post", "toms"], verified: true },
      { label: "Memory placement", value: "All model experts in GPU memory; about 110 GB of Engram tables in system RAM", sourceIds: ["homelab-post", "github", "toms"], verified: true },
      { label: "Driver", value: "NVIDIA R580, the last branch that supports Volta GPUs", sourceIds: ["homelab-post", "nvidia"], verified: true },
      { label: "Users at once", value: "One request at a time (two to three in testing)", sourceIds: ["homelab-post", "toms"], verified: true },
    ],
    discrepancies: [
      {
        topic: "Is the setup fully offline today?",
        accounts: [
          { sourceId: "toms", claim: "Headline describes the server as keeping legal files offline." },
          { sourceId: "homelab-post", claim: "Documents processed on this server never leave the office, but by the builder's estimate it handles 50–60% of his AI work; the rest still runs on frontier models." },
          { sourceId: "toms-forum", claim: "The builder says he is working toward a fully offline local setup." },
        ],
        resolution:
          "Both are true at different scopes. Case files sent to this server stay in the building; the practice as a whole is not yet fully self-contained, by the builder's own account.",
      },
    ],
    body: `Most conversations about AI in business start with a subscription: pick a vendor, sign up, paste in your documents. Nick Mermiges took a different route. The South Carolina trial lawyer, who has practiced for more than eleven years, built an AI server out of used data-center parts so his case files never have to leave his office.[^pli][^toms]

He documented the build in public, including the parts that broke.[^homelab-post] It's worth a close look even if you'll never own a GPU. The questions he had to answer are the same ones any business faces once its data is too sensitive to hand to someone else.

## What he built

The heart of the machine is eight NVIDIA Tesla V100 GPUs. They are 2018 data-center cards, each with 32 GB of fast memory, mounted four to a board. The four cards on each board share a high-speed NVLink connection, which gives each board 128 GB of memory that works as one pool. The two boards talk to each other over ordinary PCIe, which is much slower.[^homelab-post]

That design choice is the whole trick. Used boards like these were, in his words, "the cheapest big pool of fast VRAM I know of." He paid about $1,600 for four cards with heatsinks and about $750 for the board and a switch card, roughly $2,400 for each 128 GB block.[^homelab-post] Those were his prices at the time. By early November 2026, Tom's Hardware found the same used cards listed at about $900 each, more than double what he paid.[^toms]

The rest is workstation hardware: a 12-core Threadripper PRO, 256 GB of server memory, and two power supplies totaling 2,800 W, plugged into two separate ordinary office circuits.[^homelab-post]

## How it performs

The server runs DeepSeek-V4.1-Flash, a large open AI model, compressed to mostly 2 bits so its 248.8 GB of weights fit the hardware. To keep the slow link between boards from becoming a bottleneck, the model is split in half: the first 20 layers run on one board, the last 20 on the other, so only one hand-off per step crosses PCIe.[^homelab-post][^toms]

Here are his measurements from November 5, 2026:[^github]

| Document size | Wait for first word | Code (tokens/s) | Legal writing (tokens/s) |
|:--|--:|--:|--:|
| 1K tokens | 1.2 s | 215 | 118 |
| 32K tokens | 17.2 s | 200 | 117 |
| 128K tokens | 59.2 s | 183 | 111 |
| 256K tokens | 118.7 s | 160 | 103 |

Code comes out faster than legal prose because a small built-in model guesses five tokens ahead, and code is easy to guess.[^homelab-post] For a lawyer, the column that matters most is the second one. The server reads documents at about 2,200 tokens per second, so a 128K-token case bundle takes about a minute before the first word of the answer appears.[^homelab-post]

> [!NOTE] A correction in the source
> The builder first wrote that the entire model sat in GPU memory. He corrected himself: the model's experts do, but about 110 GB of lookup tables live in ordinary system RAM. He measured the cost of that at about 0.12 ms per step.[^homelab-post][^github]

## What it took to get there

None of this worked on the first try. The machine reset itself twice with a fatal PCIe error, both times with the cards running at higher power and uncapped clock speeds. One GPU board had a burn mark on its power connector and was removed. System memory threw uncorrected errors until he slowed it from DDR4-3200 to DDR4-2666.[^homelab-post]

The fix was patience and restraint. Each card now runs capped at 150 W with a lower clock speed, and he checks the memory error counters before and after every run. A higher 200 W cap made no measurable difference to speed.[^homelab-post] Three days before his latest update, the same model on four cards managed 36–38 tokens per second; custom software work on the full eight-card setup produced the numbers above.[^homelab-post]

## What it does all day

The server does first-pass work on his own case files. It reads a folder of records, pulls out the facts, dates and numbers, writes summaries, and drafts routine documents. He drives it in plain English from a Windows PC, and it's connected to his own document databases.[^homelab-post]

The rule that makes it usable is simple: nothing leaves the office without a real review by the lawyer.[^homelab-post] The machine prepares. The lawyer decides.

By his estimate, 50–60% of his existing AI workflows can now run on this box instead of on cloud models.[^homelab-post] He has said the goal is a fully offline setup, which he believes will have real value for regulated professions.[^toms-forum]

## The honest limits

It would be easy to read this as "anyone can replace cloud AI for a few thousand dollars." That's not what the build shows.

- **One user at a time.** The server handles a single request at a time today. Running two or three at once works on his test machine but isn't in production yet.[^homelab-post][^toms]
- **Long documents mean waiting.** Fast generation doesn't remove the minute-long read on a large file.[^homelab-post]
- **Aggressive compression.** Squeezing the model to about 2 bits is what makes it fit. He reports solid scores on legal and general benchmarks and is working on a higher-precision version that he hopes will run at about 80 tokens per second.[^github][^toms-forum]
- **Old hardware, short runway.** NVIDIA's R580 driver is the last branch that supports these Volta-generation GPUs, and CUDA 12 is their last toolkit family.[^nvidia] Anyone copying this build is buying into a frozen software stack.
- **It's a serious engineering project.** PCIe switches, cable runs, power limits and custom kernels. He calls it, in part, a hobby.[^toms-forum]

## Why every business should pay attention

The lawyer's motivation is professional duty. In July 2024 the American Bar Association issued Formal Opinion 512, its first formal guidance on generative AI. It reminds lawyers that the duty to keep client information confidential applies to these tools, and that client consent is needed before entering client information into AI tools that learn from what they're given.[^aba][^ncbex]

Most businesses don't answer to a bar association. Plenty answer to something similar: patient records, financial data, employee files, bid pricing, customer contracts, proprietary designs. The question this lawyer answered with hardware is one every one of those businesses has to answer somehow: **which information is allowed to leave the building, and who decides?**

Three lessons carry over directly:

1. **Private AI is now within reach of a small firm.** One professional, working largely alone, built a system that handles real daily work on hardware bought used at a few thousand dollars per GPU board.
2. **The hardware is the easy part to buy and the hard part to run.** The real work in this build was power, stability, memory errors, model splitting and software. That's an operations problem, not a shopping problem.
3. **Hybrid is the realistic starting point.** Even this build sends part of the workload to cloud models today. Deciding which work runs where, and enforcing it, matters more than going all-in on either side.

## What it would take for your business

If your company handles information it can't share, the path doesn't start with GPUs. It starts with a few plain questions:

- **What data has to stay in-house,** and which workflows touch it?
- **Which tasks are worth automating first?** Extraction, summaries and first drafts are where this lawyer started.
- **How many people need it at once?** Concurrency changes the hardware more than anything else.
- **Who keeps it running?** Drivers, updates, monitoring and security don't stop after setup.
- **Where does a person review the output** before it reaches a client or a decision?

Tomorrow's Tech AI designs and builds private AI systems for businesses that need this kind of control, from a single on-site workstation to a hybrid setup that keeps sensitive work local and sends the rest to approved cloud models. If you're weighing it, [book a private AI consultation](/contact?service=private-on-site-ai&from=/blog/lawyer-private-ai-server-used-v100-gpus&cta=body) and we'll map what should stay in your building and what it would take.`,
  },
  {
    slug: "ems-fleet-three-numbers",
    title: "The Three Numbers Every EMS Fleet Director Should Know Without Opening a Spreadsheet",
    status: "published",
    publishedAt: "2026-05-20",
    category: "industry-insights",
    authorId: "john-hockinson",
    legacy: true,
    summary:
      "Most fleet software was built for trucking, not ambulances. Here's the operational reality of running an EMS service — and what changes when you finally build software for the actual job.",
    readTime: "6 min read",
    tags: ["Fleet operations", "EMS", "Compliance", "Aegis Fleet AI", "Operations"],
    hero: {
      src: "/blog/ems-fleet-three-numbers.png",
      alt: "A curved monitor in a dark room showing three large status numbers: 12 dispatchable, 4 PM due and 2 expiring, with the time 02:47 in the corner.",
      // Provenance: embedded C2PA record (OpenAI gpt-image, IPTC trainedAlgorithmicMedia).
      credit: "AI-generated illustration: Tomorrow’s Tech AI Solutions",
    },
    body: `There's a question every EMS director should be able to answer in under five seconds, at any hour of the day:

**How many units are dispatchable right now?**

Not "how many are in service." Not "how many are scheduled for today's shift." Dispatchable. Meaning: patient-ready, fully equipped, mechanically sound, crew-staffed, compliant, and inside their operating window.

If the answer takes longer than five seconds — and for most services, the honest answer is anywhere from five minutes to an hour because someone has to open three different systems and call the bay — that's not a software problem. That's an operational vulnerability. And it's the exact gap most generic fleet software was never built to close.

## Why generic fleet software keeps failing ambulance services

Most fleet management software was built for trucking. The assumptions baked into it look like this:

- Vehicles are largely interchangeable.
- A truck out of service is annoying but not life-threatening.
- Compliance means DOT logbooks and IFTA reports.
- The driver is the operator.
- The cargo isn't waiting.

None of that maps to ambulance operations.

In medical fleets:

- Every unit has unique kit. Cardiac, peds, bariatric. ALS versus BLS. Primary versus spare. They are not interchangeable.
- A truck out of service can mean a patient doesn't get transported.
- Compliance is a layered stack. Federal HHS for Medicare and Medicaid billing. State EMS. DOT. OSHA. Plus whatever individual hospital contracts demand.
- The driver is one role. The medic crew has their own certifications with their own expirations, and those don't sync to the vehicle.
- Calls don't queue politely.

So when an EMS director uses generic fleet software, the gap isn't a feature gap. It's an entire category mismatch. The director ends up doing what they've always done: living in a spreadsheet, calling the bay, asking the maintenance lead, checking the certification binder, double-checking the staffing board.

Three minutes of phone calls to answer the question that should take three seconds.

## The three numbers that actually matter

Walk into any EMS director's office at 2:47 AM during a busy weekend, and there are three numbers that determine whether they can sleep.

### 1. How many units are dispatchable right now

Not paper-ready. Not technically in service. *Dispatchable.* Crew on, kit checked, no compliance flags, no PM overdue, no mechanical hold. The number that determines whether the next call gets answered or sits.

### 2. Which units have PM due within seven days

Because the difference between "we have nine ready units" and "we have nine ready units but four of them go down for PM next week" is the difference between a smooth Tuesday and a Tuesday spent rebalancing dispatch coverage on the fly.

### 3. Which crew certifications expire this month

Because a paramedic with an expired NREMT or a driver with an expired DOT physical isn't someone you can roll a call with. And catching that thirty days early instead of on the day of expiration is the difference between adjusting the schedule and pulling someone off shift.

These are the three numbers. They aren't strategic KPIs. They are operational realities. And in most services they live spread across:

- The maintenance spreadsheet on the bay manager's laptop
- The compliance binder in the HR file cabinet
- The staffing board in the dispatcher's notebook
- Whatever someone last texted in the group chat

## What changes when you build software for the actual job

Here's the question we kept asking when we built **Aegis Fleet AI**: what would it look like if the operational reality drove the software design, instead of the other way around?

The answer turned into one screen.

One screen that shows you, without scrolling, without phone calls, without reconciling three sources of truth:

- Total vehicles in the fleet
- How many are active right now
- How many have PM due
- How many are in repair
- Which units are at compliance risk, with what's expiring, and when

It's the difference between *finding* the answer and *seeing* it. And for an EMS director making a midnight decision about whether to delay a transport, that difference is the entire job.

## Why this matters more than features

A lot of fleet management software is sold on feature counts. *400+ integrations. 50+ reports. AI-powered insights.*

That's not what runs an ambulance service.

What runs an ambulance service is the ability to answer the three numbers in three seconds, to act on them, and to know that the system you're trusting was built by people who understood that a dispatchable ambulance isn't an asset — it's a promise to a patient.

We built **Aegis Fleet AI** specifically for EMS and medical fleets. Not generic fleet management with a medical skin painted over it. Purpose-built. AI agents handle the work behind the scenes — PM scheduling, compliance tracking, dispatch readiness — so the director, the dispatcher, and the bay manager can focus on what actually matters: keeping ready units on the road.

If you run a fleet — county service, private medical transport, multi-station system, anything where a call can't wait — take a look at what we shipped.

[**→ aegisfleetai.com**](https://aegisfleetai.com)

Safety. Compliance. Protection.

Built by operators who carried the radio.`,
  },
  {
    slug: "smartsheet-claude-mcp",
    title: "The Smartsheet Tool I Wish I'd Had 18 Years Ago: Claude's MCP Integration",
    status: "published",
    publishedAt: "2026-05-19",
    category: "business-automation",
    authorId: "john-hockinson",
    legacy: true,
    summary:
      "For two decades, my job was finding the answer hidden in the spreadsheet. Claude's MCP integration just changed what's possible for operations teams running on Smartsheet.",
    readTime: "6 min read",
    tags: ["Smartsheet", "Claude AI", "MCP", "Operations"],
    hero: {
      src: "/blog/smartsheet-claude-mcp.png",
      alt: "Streams of blue data lines flowing into a project dashboard with a Gantt schedule, a contractor master sheet, a status feed and project health scores.",
      // Provenance: embedded C2PA record (OpenAI gpt-image, IPTC trainedAlgorithmicMedia).
      credit: "AI-generated illustration: Tomorrow’s Tech AI Solutions",
    },
    body: `For most of my career running telecom and infrastructure programs, my job was finding the answer hidden in the spreadsheet.

Which crew is approved to work in this market? Pull the contractor master sheet, filter, cross-reference compliance, check capacity, look up mobilization lead time.

How many of last week's site builds came in under budget? Run a report, dump to Excel, reformat, build a pivot, present to leadership Monday.

Why did this project slip? Find the change log, scroll through 200 rows of comments, find the moment someone shifted a dependency, build a timeline.

Hours every week. Sometimes hours every day.

The information was always in Smartsheet. The hard part was getting it out, summarized, and into a form a human could actually use.

That just changed.

## What Just Changed

If you haven't heard of MCP — Model Context Protocol — that's about to become important. It's an open standard from Anthropic that lets AI models like Claude connect directly to your tools. Not "Claude can read a screenshot of your spreadsheet" — but "Claude can query your live Smartsheet workspace and act on the results, with your approval."

When you wire Claude into Smartsheet via MCP, this is what becomes possible:

- "Show me every contractor crew that's approved, available next week, and compliant for fiber work in the Killeen market."
- "Build a Q4 forecast report comparing planned vs. actual project completion across the construction division."
- "Flag every project where the schedule baseline has slipped more than 5 days and tell me why."
- "Draft a status update for executives based on this week's site closeouts."

Not "here's a template you could use." Actual answers, grounded in your live data, on demand.

For someone who's spent two decades inside operations, this isn't another AI demo. **This is a foundational shift.**

## What It Actually Means for Operations Teams

The biggest mistake we see leaders making right now: thinking AI is about replacing work. It isn't. **AI is about removing the friction between you and the work that matters.**

Here's what changes when Claude sees your Smartsheet directly:

**Scheduling decisions get faster and better.** That contractor master sheet I mentioned? With Claude wired in, you can ask "should we send Crew 7 to this project?" and get an answer that's already accounted for approval status, compliance gates, equipment capacity, scheduling violations, and mobilization lead time.

**Status reporting becomes a conversation.** No more chasing PMs for updates. Ask "what changed across all active projects this week?" and you get a real summary grounded in actual sheet data.

**Knowledge stops walking out the door.** Tribal knowledge gets captured. Claude reads the notes, the change logs, the comments. The institutional memory becomes accessible to the next coordinator without a 6-month ramp.

**Cross-departmental visibility actually happens.** When Claude can read across all your sheets and reconcile in real time, the "do the numbers match" question gets a real answer.

## Why "Propose, Never Act" Matters

Here's the part most AI integrations get wrong: they're built to *automate*, not to *assist*. They send the email. They commit the change. They post the update. And when they're wrong, it's loud, public, and expensive.

That's not how we build. Every Claude-powered workflow we set up at Tomorrow’s Tech AI follows one rule: **AI proposes, you decide.**

Claude can draft the schedule change. You approve before it's committed. Claude can suggest the right crew. You confirm before dispatch. Claude can compile the executive summary. You read it before it ships.

The integration gives you leverage, not handed-over control. AI is leverage, never autopilot.

## Where to Start

If you're a Smartsheet-first operations team thinking about this, here's the sequence we'd recommend:

**1. Map the queries that already kill your week.** What questions do you keep asking your sheet that take more than 5 minutes to answer? Those are your first MCP targets.

**2. Clean the foundation first.** Layer AI on disorganized sheets and AI gives you disorganized answers. Column naming has to be consistent. Status fields need defined values. The contractor master sheet has to be the single source of truth.

**3. Start with read-only queries.** Don't give Claude write access on day one. Build trust through accuracy before write access.

**4. Define your propose-vs-act boundaries.** Make it explicit. Hardest part culturally, most important.

**5. Scale to write actions one workflow at a time.** Low-risk writes first. Trust the pattern, then expand.

That's where we work. If your team is running operations through Smartsheet and you're wondering what an MCP-enabled workflow could look like for your specific business, we'd be glad to compare notes.`,
  },
  {
    slug: "what-a-private-ai-business-unit-actually-does",
    title: "What a Private AI Business Unit Actually Does for a Company",
    status: "published",
    publishedAt: "2026-03-12",
    category: "private-ai",
    authorId: "john-hockinson",
    legacy: true,
    summary:
      "A lot of people hear the term AI and immediately think of chatbots, public tools, or content generation. A private AI business unit is something different.",
    readTime: "4 min read",
    tags: ["Business AI", "Internal Tools", "Nexus One", "Private AI Business Unit"],
    hero: {
      src: "/blog/what-a-private-ai-business-unit-actually-does.png",
      alt: "Illustration of two business people facing a glowing server tower labeled Nexus One, under the headline Private AI Business Unit for Companies, with icons for custom AI agents, internal tools, smarter workflows and better control.",
    },
    body: `A lot of people hear the term AI and immediately think of chatbots, public tools, or content generation.

But a private AI business unit is something different.

It is not just about using AI. It is about using AI in a way that fits the actual needs of the business.

## AI for Business Is Different from AI for General Use

A private AI business unit gives a company a dedicated environment for AI-supported workflows, internal tools, business analysis, and company-specific use cases without depending entirely on scattered public platforms. It creates more control, more consistency, and a stronger foundation for building smarter internal systems.

## Why Businesses Need AI for Execution

That matters because most businesses do not need AI for novelty. They need AI for execution.

They need help organizing information, reducing manual work, improving internal support, speeding up analysis, and building tools that fit the way the business actually runs. They also need a setup that can be maintained, improved, and expanded over time instead of being treated like a one-time experiment.

That is where a private AI business unit becomes powerful.

## What Makes a Private AI Business Unit Valuable

When paired with the right command center and workflow systems, it can support custom agents, internal automation, reporting support, process assistance, and other business functions in a way that feels practical instead of experimental.

It also gives the business a stronger operating posture. Instead of chasing random tools and hoping they fit, the company has a more deliberate AI layer built around real workflows, real support needs, and real business movement.

That does not mean every company needs the same setup. It means the right company can benefit from having AI infrastructure that is designed for business use, not just public use.

The biggest benefit is not hype. It is productivity.

A private AI business unit can help reduce wasted motion, support internal teams more effectively, and make AI feel like part of the business instead of a disconnected add-on.

For companies that want to move beyond surface-level AI use, that is where the real value begins.`,
  },
  {
    slug: "hidden-cost-of-broken-workflows",
    title: "The Hidden Cost of Broken Workflows in Growing Businesses",
    status: "published",
    publishedAt: "2026-03-12",
    category: "business-automation",
    authorId: "john-hockinson",
    legacy: true,
    summary:
      "Broken workflows do not always look dramatic. They often look like delays, rework, confusion, and wasted payroll. That is where businesses quietly lose money.",
    readTime: "5 min read",
    tags: ["Approvals", "Broken Workflows", "Business Operations", "Process Improvement", "Workflow Automation"],
    hero: {
      src: "/blog/hidden-cost-of-broken-workflows.png",
      alt: "Illustration of a shattered gear with a warning sign next to a dashboard and a workflow report, under the headline The Hidden Cost of Broken Workflows, with labels for delayed approvals, rework and errors, wasted payroll and reporting delays.",
    },
    body: `Broken workflows do not always look dramatic. They often look like delays, rework, confusion, and wasted payroll. That is where businesses quietly lose money.

A broken workflow does not always announce itself.

It usually does not show up as one huge failure. More often, it shows up as daily friction that companies slowly get used to.

## What Broken Workflows Really Look Like

It looks like late approvals. Missing information. Repeated follow-up. Incorrect forms. Reporting delays. Rework. Teams waiting on updates. Tasks getting kicked back. Invoicing slowdown. Payroll issues. Leadership asking for the same information over and over because the system is not making the answers visible.

That is the hidden cost of broken workflows. They create drag everywhere.

## Why Workflow Friction Gets Worse as Companies Grow

For a growing business, this gets worse over time. What once felt manageable through calls, texts, memory, spreadsheets, and manual follow-up becomes harder to control as more people, more tasks, and more complexity get added into the mix.

At that point, the business is not just dealing with inefficiency. It is dealing with operational friction that starts eating time, attention, and margin every day.

Broken workflows cost money in ways many companies underestimate.

They waste labor hours. They create repeated work. They slow approvals. They weaken accountability. They delay billing. They make reporting harder to trust. They pull leadership into avoidable follow-up. They cause teams to spend too much energy recovering from process gaps instead of moving work forward.

The frustrating part is that many businesses normalize this. They begin treating friction as if it is just part of growth.

It is not.

## What a Better Workflow System Should Do

A better workflow system should move information cleanly from one stage to the next. It should support approvals, reduce manual handoffs, create visibility, and make sure the right people are involved at the right time. It should help catch mistakes early and keep problems from rolling downstream into larger business issues.

When a workflow package is built correctly, the difference is usually felt quickly.

Things move faster. Reporting gets cleaner. Approvals become more consistent. Teams stop guessing. Leadership spends less time chasing updates. Accountability becomes easier to manage because the system is doing more of the work it should have been doing all along.

Growth becomes much easier when the workflows stop fighting the business.

That is why broken workflows should not be treated like minor annoyances. In many companies, they are one of the biggest silent profit leaks in the entire operation.`,
  },
  {
    slug: "why-companies-need-a-command-center",
    title: "Why Most Companies Don't Need More Software — They Need a Command Center",
    status: "published",
    publishedAt: "2026-03-12",
    category: "industry-insights",
    authorId: "john-hockinson",
    legacy: true,
    summary:
      "Most companies assume the answer to operational problems is adding another tool. But the real issue is usually that the business has become too scattered to see clearly.",
    readTime: "5 min read",
    tags: ["Business Systems", "Command Center", "Leadership", "Operations", "Visibility"],
    hero: {
      src: "/blog/why-companies-need-a-command-center.png",
      alt: "Illustration of a team in suits standing in a server corridor framed by a command center dashboard, under the headline Why Most Companies Don't Need More Software, They Need a Command Center.",
    },
    body: `Most companies assume the answer to operational problems is adding another tool.

Another app. Another platform. Another report. Another place for information to live.

But in many businesses, the real issue is not a shortage of software. The real issue is that the business has become too scattered to see clearly.

When reporting is spread across different places, updates depend on manual follow-up, and leadership has to chase answers across multiple tools, the business starts losing control. Not because people are lazy. Not because the company lacks effort. But because the systems are not working together in a way that makes the operation visible.

## That Is Where a Command Center Becomes Valuable

A command center is not just a prettier dashboard. It is a business control layer built around visibility, accountability, and operational clarity. It gives leadership one place to see what matters most without digging through disconnected systems to piece the story together.

That can include open tasks, workflow movement, reporting status, approvals, project health, employee metrics, fleet oversight, billing support, payroll flow, and more. The exact setup depends on the business, but the purpose is always the same: give the company a cleaner way to manage what is moving.

## Without That Kind of Structure, the Symptoms Show Up Fast

Leaders ask the same questions again and again because the answers are not visible. Teams spend time building manual updates that should already exist. Reporting gets delayed. Problems sit too long before the right person sees them. Accountability weakens because no one has one clear operating view.

This is not really a software problem. It is a systems problem.

The strongest businesses are not always the ones with the most tools. They are often the ones with the clearest systems. They know where things stand, what is moving, what is stuck, and what needs attention.

That kind of visibility changes the pace of decision-making. It reduces wasted motion. It gives leadership better control. It helps teams spend less time chasing information and more time acting on it.

More software does not always fix a messy operation.

In a lot of cases, what the business really needs is a command center built around how it actually runs.`,
  },
  {
    slug: "1-ai-mistake-businesses-make",
    title: "The #1 AI Mistake Businesses Make (And How to Avoid It)",
    status: "published",
    publishedAt: "2025-02-04",
    category: "technology-guides",
    authorId: "john-hockinson",
    legacy: true,
    summary:
      "Too many companies are diving into AI without a clear strategy. The biggest mistake? Implementing AI without a business-driven approach. AI should solve real problems, not just be a shiny new tool.",
    readTime: "6 min read",
    tags: ["AI Adoption", "AI Strategy", "Business AI", "AI Implementation"],
    hero: {
      src: "/blog/1-ai-mistake-businesses-make.png",
      alt: "Split image: on the left, a desk covered in sticky notes reading No Clear Strategy, Budget Overrun and Use Cases Unclear; on the right, the same work organized into a project timeline, contractor sheet and status dashboard.",
      // Provenance: embedded C2PA record (OpenAI gpt-image, IPTC trainedAlgorithmicMedia).
      credit: "AI-generated illustration: Tomorrow’s Tech AI Solutions",
    },
    body: `Artificial Intelligence (AI) is no longer a futuristic concept — it's here, and businesses are racing to adopt it. But there's a problem.

Too many companies are diving into AI without a clear strategy. They're chasing trends, investing in AI tools without defined objectives, and expecting magic. The result? Wasted budgets, failed projects, and frustrated teams.

It's easy to get caught up in the AI buzz. With ChatGPT, automation tools, and AI-driven analytics flooding the market, many businesses feel pressured to "do something with AI" — even if they're unsure why or how.

The biggest mistake? Implementing AI without a business-driven approach. AI should solve real problems, not just be a shiny new tool in your tech stack.

## Signs Your AI Strategy Might Be Off-Track

- Investing in AI before defining a clear business goal
- Expecting AI to work without quality data
- Believing AI can instantly replace human expertise
- Scaling AI before running a pilot test
- Lacking internal AI expertise or leadership

Instead of following the hype, companies need a structured, goal-oriented AI approach. Here's how to do it right.

## 1. Start with a Business Problem, Not Just AI

Ask yourself: what challenge are we solving? AI is a tool — its success depends on aligning it with your company's biggest pain points.

According to McKinsey's AI report, businesses that strategically implement AI see a 20–30% boost in efficiency.

## 2. Think Automation Before Innovation

Before building cutting-edge AI solutions, look at your existing workflows. AI's biggest wins often come from automating repetitive tasks, improving efficiency, and reducing costs.

The mistake is jumping to the moonshot before fixing the mundane. The mundane is where the money is.

## 3. Data Is King — Get It Right First

AI learns from data. If your data is incomplete, biased, or messy, your AI won't deliver the results you expect. Before implementing AI, ensure data quality and governance are in place.

This is the part most "AI consultants" skip. It's also where most AI deployments quietly fail.

## 4. Pilot, Measure, Scale

Start small. Test AI in one area, measure impact, then expand. A common mistake is rolling out AI across the entire organization without first proving its value in a controlled environment.

## The Tomorrow’s Tech AI Approach

At Tomorrow’s Tech AI, we help businesses cut through the AI noise and develop strategies that actually work. Our approach focuses on:

- Identifying the right AI use cases for your business
- Ensuring high-quality data for AI models
- Implementing AI in a way that drives real ROI
- Avoiding the common pitfalls that lead to AI failures

If you're looking to future-proof your business with AI, let's talk.`,
  },
  {
    slug: "why-ai-isnt-optional",
    title: "Why AI in Business and Project Management Isn't Optional — It's the Future",
    status: "published",
    publishedAt: "2025-02-03",
    category: "industry-insights",
    authorId: "john-hockinson",
    legacy: true,
    summary:
      "AI is the ultimate game-changer for project management and startups. Companies slow to adopt will find themselves outpaced by competitors who embrace it. The early movers will dominate.",
    readTime: "5 min read",
    tags: ["AI Adoption", "AI Project Management", "Automation Strategies", "Business AI", "Future of AI"],
    hero: {
      src: "/blog/why-ai-isnt-optional.webp",
      alt: "Illustration of a translucent humanoid AI figure standing in a glass-walled boardroom while business people sit around a conference table.",
    },
    body: `AI isn't coming — it's here. And those who embrace it now will lead the next wave of innovation.

For years, businesses have relied on manual decision-making, outdated workflows, and gut instinct. But in a world where speed, precision, and adaptability define success, AI is the ultimate game-changer — especially in project management and startups.

We've been at the forefront of this shift, integrating AI into business strategy, operations, and execution. The results: faster decision-making, reduced inefficiencies, and exponential scalability. And yet, many businesses are still hesitant to take the leap.

## AI in Project Management: The Competitive Edge

Startups and enterprises alike live and die by execution. AI revolutionizes project management in ways that can't be ignored:

**Predictive Analytics** — AI doesn't just track progress; it foresees obstacles before they happen. Imagine knowing when a project will go off track before it does.

**Automated Workflows** — No more wasted hours on repetitive tasks. AI optimizes processes so teams can focus on innovation, not administration.

**Data-Driven Decision Making** — AI removes guesswork. It analyzes historical trends, market shifts, and team performance to suggest the best course of action.

**Scalability Without Chaos** — Whether you're running a startup or scaling a business, AI ensures growth doesn't mean disorganization, missed deadlines, or burnout.

## Why Businesses Can't Afford to Wait

Companies slow to adopt AI will find themselves outpaced by competitors who embrace it. The same way cloud computing, automation, and digital transformation reshaped industries, AI is the next evolution — and the early adopters will dominate.

Leaders who integrate AI into their business strategy today will be the ones shaping the market tomorrow. That's why we've been deeply invested in pushing AI adoption in business — because the ones who move first will own the conversation.

## Final Thoughts: Be the One Who Moves First

AI isn't replacing business leaders — it's enhancing them. The future belongs to those who recognize AI's power, integrate it into their strategy, and use it to build smarter, more efficient businesses.

We're all in. Are you?`,
  },
];
