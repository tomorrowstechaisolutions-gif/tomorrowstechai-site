# Tess and the crew: design

Date: 2026-11-20
Status: approved by John, 2026-11-20
Replaces the three placeholder admin tabs: AI Command Center (`/admin/ai`), AI Agents (`/admin/ai/agents`), Triggers (`/admin/automations/triggers`).

Mockups that were approved during the design conversation are in
`.superpowers/brainstorm/724-1795154360/content/` (local, not committed):
`entity.html` (option B chosen), `grand-tab.html`, `the-floor-v4.html`.

## 1. Why this exists

John builds products well and stalls at getting them in front of buyers. In his words: "great at building but very weak at getting my products out". Two real leads sat untouched for 78 days while the admin was being built.

Tess is the answer to that specific weakness. She is a lead AI with a crew under her that runs go-to-market for one business at a time: finds prospects, follows up, publishes, watches the numbers, and tells John each morning where things stand and what to do first.

It has a second job. John sells custom back ends with AI built in. This is the showpiece, so it has to look good enough to film and be honest enough to survive a buyer asking "what is that bot actually doing?".

## 2. What John decided

These are his decisions, in his terms. They are not open.

- **The lead is a she, named Tess** (from Tomorrow's Tech). She speaks with an ElevenLabs voice; John has a subscription. He talks to her and she talks back.
- **Her presence is "the Core":** a breathing sphere of points (mockup option B), not the spire or the lattice.
- **The grand tab** is laid out as in `grand-tab.html`. He said "I love it".
- **The floor** is a 3D room with robots walking between stations (`the-floor-v4.html`). He wants the final version to look clearly better than the mockup, and the glow must not spike.
- **The crew:** one specialist per business, plus function experts. Sales and social must be strong teams, not single bots.
- **The crew acts on its own.** John dropped his "propose, never act" rule for this: "I want this all set up correctly with nothing to hold it back", and "I don't want to babysit everything; if we find mistakes along the way we will learn and fix them".
- **But only on work that helps the business.** "We don't want them just doing what they want unless it is helping our business by getting sales or leads."
- **Every morning** he logs in and talks to Tess. She tells him where things are and where to start, and she learns his businesses over time.
- **He wants real advice** that helps get the businesses off the ground.
- **Tomorrow's Tech AI goes first** as the business the whole crew works on.

## 3. Goals, non-goals, anti-goals

**Goals**

1. A morning conversation, by voice, that ends with John knowing his top one to three moves.
2. A crew that produces leads and sales activity for the launch-mode business without John initiating or approving each action.
3. Every action traceable: which bot, which goal it served, what it expected, what happened.
4. A grand tab and a floor good enough to film.
5. Advice that is grounded in John's own numbers and is allowed to disagree with him.

**Non-goals (not in this project)**

- A version of this for clients. It is built so it can be sold later, but nothing client-facing ships here.
- A phone app.
- Replacing the existing dashboard. Tess sits alongside it.
- Training or fine-tuning a model.

**Anti-goals (these make it a failure even if it works)**

- **A prop.** A bot with no data feed, no scheduled work and no way to act does not ship.
- **Fake activity.** Nothing moves on the floor unless a real step was logged. A replay of real past steps is allowed and must be labelled as a replay.
- **An approval queue as the default.** If John has to click approve for routine work, the design has failed.
- **A black box.** John can open any step and see what went in and what came out.
- **Busywork.** A bot is scored on outcomes (replies, booked calls, sales), never on how many actions it took.

## 4. The crew

One lead and 14 crew. "Bot" here means a role, a knowledge pack, a set of tools and a memory, run on a shared engine. It is configuration, not a separate program.

| Rank | Bot | Standing job |
|---|---|---|
| Lead | **Tess** | Talks with John. Plans the day. Reads every crew report. Flags a bot that is busy but not moving its number. |
| Sales desk | **Outreach** | Finds prospects that fit the playbook and sends the first email. |
| Sales desk | **Follow-through** | Makes sure no lead goes quiet; replies to answers; books calls. |
| Social desk | **Content** | Writes and publishes posts. |
| Social desk | **Performance** | Watches what works and changes the plan. |
| Function | **Finance** | Bank, invoices, what is owed; sends payment reminders. |
| Function | **Ads & SEO** | Search rankings, ad spend. |
| Function | **Operations** | Projects, tasks, health of scheduled jobs. |
| Business | **Tomorrow's Tech AI**, **Held**, **SplicePoint**, **Pool Business AI**, **Dark Tides Supply**, **Proudly Texan**, **Storyborn** | Knows one business deeply. In launch mode it directs the desks for that business. In maintenance mode it only watches its numbers and flags problems. |

The split of sales and social into two bots each, and the three function bots, are my proposal; John asked for "a very strong sales and social media team" and accepted the roster as shown in the mockups.

**It works as a matrix.** A question about Dark Tides ads pulls the Dark Tides specialist (what the business is) and Ads & SEO (how ads work).

**SplicePoint's specialist** is meant to be a master of fiber construction operations. That knowledge has to be written down by John and loaded as documents. Until it is, that bot knows only what SplicePoint's own reports say.

## 5. How the crew is allowed to act

Three layers.

**Layer 1: goals decide what work is allowed.** Each business has a target (for example 10 qualified leads and 2 sales this month), a playbook (who to sell to, which offers, which channels, voice, what is off limits) and caps. Before a bot acts it records which goal the action serves and what it expects to happen. An action with no goal is refused. Afterwards the result is recorded against the expectation.

**Layer 2: caps and a short "always John" list decide how far it can go.**

- Free: publish to social, email leads (first contact, follow-ups, replies), update the CRM, create and close tasks, book meetings, change its own content plan, send proposals built from catalog prices.
- Free inside a cap John sets once: AI spend per day, ad spend, first emails per day, posts per day per channel.
- Always John (goes to a "needs you" list, never done by the crew): money leaving (bills, refunds, transfers), a price that is not in the catalog or signing anything, deleting records, changing who can sign in.
- Never, for anyone: contacting someone who unsubscribed or is marked do-not-contact; claiming to be a human.

The caps, the "always John" list and the two hard rules are my proposal. John was shown them and said he does not want to babysit; he did not ask for changes.

**Layer 3: corrections become rules.** When John tells Tess something should have been done differently ("don't open emails with that line"), it is stored as a standing rule that every bot reads before it acts. The count of rules is shown on the grand tab.

**In place of approval, a safety net:** every action is logged and visible as it happens; the morning brief reports what was done; there is a pause for each bot and one for the whole crew; and where an action can be undone (delete a post, cancel a scheduled send) the undo is one click.

**Launch mode.** One business is in launch mode at a time and gets the full crew. The rest are in maintenance: their specialists watch and flag, and send nothing. Switching launch mode is John's call, made from the crew tab.

## 6. The three tabs

**Tess (`/admin/ai`)**, the grand tab. As mocked:

- The Core fills the screen, with the crew as small lights orbiting it; busy ones are brighter and faster.
- Four states, each visibly different: waiting, listening, thinking, speaking. Her words appear as text under the Core while she speaks.
- Top bar: launch-mode business, crew count and how many are working, today's spend against the cap, rules learned, pause.
- Left: "Start here" (one to three ranked moves, each with its reason) and "While you were out" (what the crew did since John was last here).
- Right: this month's targets against goal, and the crew with what each is doing and its score. A door to the floor.
- Bottom: hold space to talk, or type.
- **Stage mode** hides every panel and leaves the Core and her voice. This is the filming view.

**The floor (`/admin/ai/floor`)**, opened from the grand tab:

- A 3D room. Tess's Core on a pedestal in the middle.
- Eight stations around it, each a real system: Inbox, CRM, Prospecting, Social studio, Bank, Stripe, Analytics, Library.
- Robots fly to a station, work there, and report back to the Core. A bot in maintenance mode sits on the ground with its lights off.
- Each desk has a visible tell (headsets on sales, halos on social, and so on) and a colour.
- Click a bot for its target, score and current step. A live log of steps down the side.
- Three cameras: orbit, overview, follow the selected bot.
- **Replay last shift:** when nothing is running, the floor can replay the most recent shift from the log, labelled as a replay with its real time.

**Crew (`/admin/ai/agents`)**, which also absorbs Triggers:

- Each bot's role, knowledge, tools, schedule, caps, score and history.
- Each business's mode, target and playbook.
- The rules list, editable.
- The "needs you" list.
- This is where John tinkers.

## 7. How it gets built (my calls)

John said "if you were me, build me the perfect setup", so the how is mine. Each of these is my decision, not something he chose.

**Approaches considered**

1. *Brain first, visuals last.* Build the engine and all 14 bots, then the screens. Safest technically; weeks with nothing to look at, and John loses momentum when nothing is visible.
2. *Visuals first.* Build the grand tab and floor, wire the crew in later. Fast wow; real risk of a shell with nothing behind it, which is the main anti-goal.
3. *A thin slice of everything, then widen.* **Chosen.** Tess with the Core and voice, three real crew, and the floor showing those three. It proves every layer end to end and gives John something real to film early. After that, each further bot is mostly configuration.

**Other calls**

- **Own engine on our own tables and the Claude API**, not a hosted agent platform. This is the thing John sells, and he does not like black boxes.
- **ElevenLabs is used for the voice only** (text to speech, and speech to text if the browser's own recognition is not good enough). The thinking stays in our engine.
- **Tess runs on the most capable current Claude model; the crew on a cheaper one.** The builder must check current model ids and the SDK version against Anthropic's documentation before choosing; the repo's SDK pin is old.
- **3D uses three.js**, loaded only on the two tabs that need it.
- **Reuse what exists:** the lead email sender and suppression list, the social publisher, the task and calendar actions, the bank and Stripe readers, the product reports, the cron guard and run log, the rate limiter's daily budget, and the existing `ai_actions` table for the "needs you" list.

- **Setup is a conversation with Tess, and it is part of slice 1.** The gate refuses any action without a goal, so nothing can be sent on a made-up playbook. On first run Tess interviews John (who he sells to, which offers, voice, what is off limits, this month's target), writes the playbook and target, and reads them back. The crew sends nothing for a business until John has confirmed its playbook and target. Starting caps, which he can change on the crew tab: $5 a day of AI spend, 5 first emails a day, 2 posts a day per channel.
- **What happens to the automation that already exists:**
  - The automatic 24-hour and 72-hour lead follow-up emails (`/api/cron/followups`) are switched off for a business when Follow-through takes it over, so a lead never gets both. The gate also refuses a second email to the same person inside a minimum gap, whoever asks.
  - The social publisher, the campaign email sender and their scheduled jobs stay. They are the machinery; the crew calls them as tools.
  - The weekly AI insights job and the dashboard's advisor panel are retired once Tess's morning brief covers them (end of slice 2). Until then they keep running.
  - `ai_actions` was built as a propose-then-approve queue. It is kept and narrowed: it now holds only "always John" items. Its approve button gains what it lacks today, which is actually carrying the approved thing out.
- **Every table carries a business key from slice 1**, so launch mode can move later. Sending as another business (its own mailbox, social accounts and leads) is not built until slice 3; until then only Tomorrow's Tech AI can be in launch mode.
- **A station appears on the floor only when a tool maps to it.** Slice 1 shows the stations its three bots use. Prospecting appears when Outreach ships. An unlit station with nothing behind it would be a prop.

**Shape of the engine**

- *Tables (new):* businesses with mode, target and playbook; agents with role, model, tools, schedule and caps; goals; runs; steps (one row per thing a bot did, with the station it maps to, the goal it served and what it expected); outcomes; rules; memory.
- *A run* is a bounded loop: the model is given its role, the rules, the relevant knowledge and its tools, and takes steps until its job is done or it hits a step or time limit. Runs are resumable, because a server request here can only last about a minute.
- *One gate for every action.* Every tool that changes anything goes through a single function that checks, in order: is the crew or this bot paused, is there a goal, would this break a rule or a hard rule, is the person suppressed, is a cap exceeded, is it on the "always John" list. Then it does it and logs the step. No tool may bypass the gate.
- *Shifts* are scheduled jobs. *Chat* is a run started by John talking to Tess. Both write the same step log, and the floor reads only that log.

**Order of work**

1. **Slice 1.** Engine, gate, step log. Tess: chat by text and voice, the Core, the morning brief, Stage mode. Three working crew: Follow-through, Content and Finance, on Tomorrow's Tech AI. The floor showing those three, driven by real steps, with replay.
2. **Slice 2.** Outreach and Performance. Targets, scores, outcomes. Rules learned from corrections. The crew tab.
3. **Slice 3.** Ads & SEO and Operations. The seven business specialists and their knowledge packs. Launch-mode switching.
4. **Slice 4.** The floor brought up to the quality John asked for: designed robots, animation, sound, broadcast-style camera.

**Testing.** The gate gets the most tests, since it is what stands between the crew and John's customers: paused, no goal, rule broken, suppressed contact, cap hit, "always John" item. The run loop is tested with a fake model. Tools are tested against the in-memory database used by the existing webhook tests.

## 8. Left to the builder

- Table and column names, and the exact tool list per bot.
- How the floor gets new steps (polling or a live subscription).
- Robot design details, within "designed robots with a visible tell per desk, calm glow".
- The wording of Tess's morning brief, within "what changed, what the crew did, the one to three moves that matter, ranked, each with its reason".
- How knowledge packs are stored and retrieved.

## 9. Known risks

- **A crew acting under John's name will sometimes send something he would have worded differently.** The design keeps those mistakes small, visible and correctable. It does not make them impossible. John accepted this.
- **Cold outreach has legal and deliverability rules** that the current setup does not meet. See open questions.
- **Cost.** Fourteen bots on schedules can spend real money on AI calls. The daily cap is enforced in the gate, and Tess reports spend every morning.
- **Sparse activity.** Early on there is little to do, so the floor is often quiet. Replay keeps it honest and watchable.

## 10. Questions John answered

Both were open when the document was first written and are now settled.

1. **Answered 2026-11-20: signed as Tess.** The crew's emails are sent from John's own mailbox (so replies land in the Inbox tab and thread properly) and signed "Tess, AI assistant to John Hockinson, Tomorrow's Tech AI". John was offered signing as himself and approved the recommendation.
2. **Answered 2026-11-20: yes, Outreach may email businesses that have not contacted John.** He supplied a street mailing address for those emails. It is stored as a business setting, not written into code or this document, and it is printed only on first-contact outreach emails, not on the public site, which stays city-only. The 5-a-day cap applies. Prospects come from public business listings. (I told John the address will be seen by every recipient and that a PO box or virtual mailbox would keep a home address private; the choice is his and can be changed in settings at any time.)

## 11. Things John has to supply

- An ElevenLabs API key, stored as the environment variable `ELEVENLABS_API_KEY` (server-side only, never sent to the browser), and a choice of voice for Tess, stored as `ELEVENLABS_VOICE_ID`.
- A mailing address for outreach emails. Supplied 2026-11-20; to be entered in settings when the field exists.
- Written fiber construction knowledge for the SplicePoint specialist. John will train that bot later; it is not part of the first three slices' acceptance.
