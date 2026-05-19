export type Post = {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  readTime: string;
  tags: string[];
  body: string;
};

export const posts: Post[] = [
  {
    slug: "smartsheet-claude-mcp",
    title: "The Smartsheet Tool I Wish I'd Had 18 Years Ago: Claude's MCP Integration",
    date: "May 19, 2026",
    excerpt:
      "For two decades, my job was finding the answer hidden in the spreadsheet. Claude's MCP integration just changed what's possible for operations teams running on Smartsheet.",
    readTime: "6 min read",
    tags: ["Smartsheet", "Claude AI", "MCP", "Operations"],
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

The biggest mistake I see leaders making right now: thinking AI is about replacing work. It isn't. **AI is about removing the friction between you and the work that matters.**

Here's what changes when Claude sees your Smartsheet directly:

**Scheduling decisions get faster and better.** That contractor master sheet I mentioned? With Claude wired in, you can ask "should we send Crew 7 to this project?" and get an answer that's already accounted for approval status, compliance gates, equipment capacity, scheduling violations, and mobilization lead time. The pre-flight check that used to take a coordinator 30 minutes now happens in 10 seconds.

**Status reporting becomes a conversation.** No more chasing PMs for updates. Ask "what changed across all active projects this week?" and you get a real summary grounded in actual sheet data — not a generic AI hallucination.

**Knowledge stops walking out the door.** Tribal knowledge — "we don't use that vendor anymore because of the 2024 issue" — gets captured. Claude reads the notes, the change logs, the comments. The institutional memory becomes accessible to the next coordinator without a 6-month ramp.

**Cross-departmental visibility actually happens.** That common operations pain — "if I pulled three reports from three departments right now, would the numbers match?" — gets solved when Claude can read across all of them and reconcile in real time.

## Why "Propose, Never Act" Matters

Here's the part most AI integrations get wrong: they're built to *automate*, not to *assist*. They send the email. They commit the change. They post the update. And when they're wrong, it's loud, public, and expensive.

That's not how we build. Every Claude-powered workflow we set up at TomorrowsTech AI follows one rule: **AI proposes, you decide.**

Claude can draft the schedule change. You approve before it's committed. Claude can suggest the right crew. You confirm before dispatch. Claude can compile the executive summary. You read it before it ships.

That principle becomes especially important once Claude has direct write access to Smartsheet. The integration gives you leverage, not handed-over control.

It's the same principle we built into Held, our household coordination app. Same principle behind every AI command center we deploy. Different products, same philosophical anchor: AI is leverage, never autopilot.

## Where to Start

If you're a Smartsheet-first operations team thinking about this, here's the sequence I'd recommend:

**1. Map the queries that already kill your week.** What questions do you keep asking your sheet that take more than 5 minutes to answer? Those are your first MCP targets. Contractor capacity, project slippage, weekly status, compliance status — these are the most common starting points.

**2. Clean the foundation first.** This is the part most companies skip — they try to layer AI on disorganized sheets, and AI gives them disorganized answers. Column naming has to be consistent. Status fields need defined values. The contractor master sheet has to be the single source of truth. Get the data architecture right, *then* turn on AI.

**3. Start with read-only queries.** Don't give Claude write access on day one. Get comfortable with what it can pull, summarize, and surface. Build trust through accuracy before you give it the ability to update rows.

**4. Define your propose-vs-act boundaries.** What does Claude do automatically? What requires a human signoff? Write it down. Make it explicit. This is the hardest part culturally and the most important.

**5. Scale to write actions one workflow at a time.** Start with low-risk writes — drafting comments, flagging anomalies, suggesting cross-sheet links. Move to higher-stakes actions only after the team trusts the pattern.

## The Bigger Picture

For 20 years, the rule in operations was: *the system that captures your work is separate from the system that interprets it.* Smartsheet was capture. Excel was analysis. PowerPoint was communication. Email was coordination. And humans were the bridge between all four.

That bridge is collapsing.

Companies that figure out how to put their work, their decisions, and their AI assistance in one connected loop are going to operate at a different speed than their competitors. Not because they're working harder. Because the friction between question and answer just disappeared.

We've watched operations teams spend years building dashboards nobody trusts and reports nobody reads. The Smartsheet + Claude MCP integration doesn't fix bad data. But for teams that already have their operational foundation in shape, it unlocks a level of decision velocity that wasn't possible before.

That's where we work. If your team is running operations through Smartsheet — dealing with field crews, contractors, fleet, compliance — and you're wondering what an MCP-enabled Smartsheet workflow could look like for your specific business, we'd be glad to compare notes.`,
  },
];

export function getPostBySlug(slug: string): Post | undefined {
  return posts.find((p) => p.slug === slug);
}
