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
  // ── Phase 5 flagship · approved, held as "draft" until release.
  //    RELEASE STEP (in the deploy commit): set status to "published" and
  //    publishedAt to the actual deployment date. The validator rejects a
  //    published article dated in the future. Every figure below was checked
  //    against the listed sources on 2026-11-09.
  {
    slug: "lawyer-private-ai-server-used-v100-gpus",
    title: "A Lawyer Built His Own Private AI Server. Here's Why Every Business Should Pay Attention.",
    status: "draft",
    // Placeholder (not a future date). Replace with the deployment date at release.
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
