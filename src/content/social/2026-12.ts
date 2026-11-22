import type { SocialBatch } from "@/lib/social/batch";

/**
 * Daily posts, 25 November to 24 December 2026. The first batch.
 *
 * For the Tomorrow's Tech AI accounts in general: AI and business systems for
 * owners of small and mid-sized businesses. Fiber and pool content belongs to
 * the SplicePoint and Pool Business AI accounts, not here.
 *
 * Every factual claim comes from the site, the admin's own code, or a
 * published Field Notes article. Nothing here is invented. Once a post has
 * been loaded, do not rename its id.
 */

const SITE = "https://www.tomorrowstechai.com";
/** So a visit from one of these posts can be told apart in analytics. */
const TAG = "?utm_source=social&utm_campaign=daily-2026-12";
const article = (slug: string) => `${SITE}/blog/${slug}${TAG}`;
const page = (path: string) => `${SITE}${path}${TAG}`;
/** Paragraphs, one per argument. */
const p = (...paragraphs: string[]) => paragraphs.join("\n\n");

export const december2026: SocialBatch = {
  slug: "2026-12",
  name: "December 2026",
  time: "11:30",
  posts: [
    {
      id: "d01",
      date: "2026-11-25",
      cardLine: "I run my own company on the same system I sell.",
      text: p(
        "I sell business systems. I also run my own company on one.",
        "Every lead, proposal, invoice and follow-up for Tomorrow's Tech AI goes through the same kind of command center we build for clients. One screen. One place to look.",
        "I did it that way on purpose. If something is slow, confusing or easy to forget, I find out before a client does.",
        "Over the next month I'll show what it does, what broke along the way, and what I'd tell any owner before they spend a dollar on AI."
      ),
    },
    {
      id: "d02",
      date: "2026-11-26",
      cardLine: "Thank you to every owner who trusted us with their business this year.",
      text: p(
        "No pitch today.",
        "Thank you to the owners who handed a small shop in Belton, Texas the keys to their website, their leads or their back office this year. That is trust, and I don't take it lightly.",
        "Enjoy the day with your people."
      ),
    },
    {
      id: "d03",
      date: "2026-11-27",
      cardLine: "No error is not the same as a status.",
      text: p(
        "Last week I noticed my own blog had gone quiet for a few days. My first thought was that something broke.",
        "Nothing had. The publishing job was running every five minutes with zero errors. There was simply nothing scheduled for those days.",
        "That is the uncomfortable kind of problem. A system can be perfectly healthy and still not be doing what you assumed it was doing. No error is not the same as a status.",
        "So when I set up daily posts like this one, the first thing built was a warning for when the queue is about to run dry. Fourteen days out, seven days out, and the day before.",
        "Where in your business does silence get read as good news?"
      ),
    },
    {
      id: "d04",
      date: "2026-11-28",
      cardLine: "What number about your business do you have to ask someone for?",
      text: p(
        "A quick test for the weekend.",
        "What is the one number about your business you have to open a spreadsheet, text someone or log in somewhere to find?",
        "Open jobs. Unpaid invoices. Leads that came in this week and haven't been called.",
        "Whatever your answer is, that is your first dashboard. Not ten charts. One number, in front of you, without asking anyone.",
        "Start there. Most of what gets sold as AI is less useful than that."
      ),
    },
    {
      id: "d05",
      date: "2026-11-29",
      cardLine: "If the process is unclear, AI just makes the confusion faster.",
      text: p(
        "I spent 18 years inside operations before I built software. Telecom, construction, infrastructure programs.",
        "The pattern was the same everywhere. The work was hard, but the work was not the problem. The problem was the spreadsheet nobody trusted, the status that lived in a text thread, and the one person who knew how it all fit together.",
        "That is why I say operations before AI. If the process is unclear, AI makes the confusion faster.",
        "Get the process visible first. Then decide what a machine should do."
      ),
    },
    {
      id: "d06",
      date: "2026-11-30",
      cardLine: "I ask my business where it stands, out loud. It answers.",
      text: p(
        "I talk to my business out loud.",
        "My admin has an AI assistant named Tess. I ask her where things stand and she tells me what changed since I was last in, and the one to three things that matter most today. If I ask for a page, she opens it and stays with me on it.",
        "She can read what is on my screen and talk it through. She can write a note on a lead when I tell her something. She cannot click buttons or send anything for me, and that is deliberate.",
        "It sounds like a gimmick until your hands are full and you still need an answer."
      ),
    },
    {
      id: "d07",
      date: "2026-12-01",
      cardLine: "Let AI look before you let it change anything.",
      text: p(
        "An AI assistant is only as useful as what it is allowed to see.",
        "Ask a general chatbot about your open jobs and it will guess, because it has never seen them. Connect it to your job list and it can answer.",
        "That connection is where the value is, and also where the risk is. Three rules I follow:",
        "Start read-only. Let it look before it is allowed to change anything.\nGive it one system, not everything.\nKeep a record of what it looked at.",
        "Useful first. Powerful later."
      ),
    },
    {
      id: "d08",
      date: "2026-12-02",
      cardLine: "60% expect to spend more on AI. 37% say it has added anything to profit.",
      link: article("ai-roi-gap-spending-vs-returns"),
      text: p(
        "In McKinsey's 2026 survey, 60% of respondents said their organizations expect to spend more on AI next year. Only 37% said AI had added anything at all to profit.",
        "That gap is not a technology problem. Most of the spending goes to tools. Very little goes to deciding what the tool is supposed to change.",
        "An operator's way to close it: pick one process, write down what it costs you today in hours or dollars, and measure the same thing ninety days later. If the number did not move, stop paying for it.",
        "I wrote up the research and the method here."
      ),
    },
    {
      id: "d09",
      date: "2026-12-03",
      cardLine: "Private AI is worth it when your files can't leave the building.",
      text: p(
        "Private AI is not for everyone. Here is how I'd decide.",
        "One. Do you handle files you are not allowed, or not willing, to send to someone else's servers? Client records, legal files, patient information.\nTwo. Would you use it every day, or a few times a month?\nThree. Is there someone who will keep the machine running?",
        "If the first answer is no, a cloud tool is cheaper and simpler. If it is yes, and the other two are yes, a box in your own office starts to make sense.",
        "Most owners who ask me about this need the first conversation, not the hardware."
      ),
    },
    {
      id: "d10",
      date: "2026-12-04",
      cardLine: "List every door a customer can come through. Who is watching each one?",
      text: p(
        "Something you can do before lunch.",
        "List every way a new customer can reach you. Phone. Website form. Facebook message. Email. Text to your cell. A referral who calls your foreman.",
        "Now answer two questions for each one. Who sees it first? How long until someone replies?",
        "Most owners find at least one door nobody is watching. That is revenue you already paid to earn.",
        "You do not need AI for this. You need the list."
      ),
    },
    {
      id: "d11",
      date: "2026-12-05",
      cardLine: "Automation that guesses is worse than automation that stops.",
      text: p(
        "While building my daily posting, a review turned up a bug I would not have found by testing.",
        "I have more than twenty pages and profiles connected to one system, for several different brands. If the right page ever went offline, the publisher would quietly look for another page that still worked and post there instead.",
        "Helpful, in theory. In practice it could have put this company's post on a different brand's page.",
        "The fix was one rule: if the right account is not available, fail and tell me. Do not improvise.",
        "Automation that guesses is worse than automation that stops."
      ),
    },
    {
      id: "d12",
      date: "2026-12-06",
      cardLine: "A new idea is more fun than the last ten percent of the old one.",
      text: p(
        "An honest one.",
        "My problem has never been a shortage of ideas. It is that a new idea is more fun than the last ten percent of the old one.",
        "What has helped is not discipline. It is a system that makes unfinished things visible and makes a new thing cost something. My assistant has a mode that parks a new idea and brings me back to the one I said mattered.",
        "If you run a business you probably know the feeling. The fix is rarely to try harder. It is to make the drift visible."
      ),
    },
    {
      id: "d13",
      date: "2026-12-07",
      cardLine: "You don't need more software. You need to see what you already have.",
      link: article("why-companies-need-a-command-center"),
      text: p(
        "Most companies do not need more software. They need to see what they already have.",
        "The usual pattern: one tool for leads, another for scheduling, another for invoices, a spreadsheet that ties them together, and one person who knows where everything is.",
        "Adding a sixth tool does not fix that. A command center does one job. It puts the numbers that run the business on one screen, pulled from the tools you already pay for.",
        "I wrote about when that is the right move and when it is not."
      ),
    },
    {
      id: "d14",
      date: "2026-12-08",
      cardLine: "Status should describe what happened, not round it off.",
      text: p(
        "A small failure taught me something about dashboards.",
        "My articles post to four channels. One of them stopped working because an account ran out of credit. The other three kept posting fine.",
        "My own system marked those posts as failed. Three out of four had gone out, and the screen showed red.",
        "Both mistakes are common. A system that hides a partial failure lies to you. A system that calls a partial success a failure trains you to ignore red.",
        "It now says what happened: published, with one channel down. Status should describe the situation, not round it off."
      ),
    },
    {
      id: "d15",
      date: "2026-12-09",
      cardLine: "My website's AI guide cannot make up a price. That is the point.",
      link: page("/guide"),
      text: p(
        "There is an AI guide on my website. It asks a visitor two or three questions and recommends one thing.",
        "The part I care about is what it cannot do. It cannot invent a service I do not sell. It cannot make up a price. It picks from a fixed list and shows the real number.",
        "A lot of website chatbots will say anything to keep a conversation going. For a business, a confident wrong answer about price is worse than no answer.",
        "If you want to see how it behaves, try to trip it up."
      ),
    },
    {
      id: "d16",
      date: "2026-12-10",
      cardLine: "Twelve questions to answer before you pay for an AI tool.",
      link: page("/operations-audit"),
      text: p(
        "Before you add AI to your operation, answer twelve questions.",
        "I put them in a three-page PDF. It takes about five minutes. They are about your operation, not about the technology.",
        "If you cannot answer them yet, a tool will not help yet, and you just saved a subscription.",
        "It is free."
      ),
    },
    {
      id: "d17",
      date: "2026-12-11",
      cardLine: "I taught my AI to roast me. The first rule was what she can never say.",
      text: p(
        "I built my AI assistant a new mode this month. It is called Funny, and its only job is to roast me.",
        "I wanted to film myself showing her off and have it go badly.",
        "One detail from building it. She can see my leads and my finances. So the first rule written into that mode was that she never says a client's name or a real number out loud, because the camera is on.",
        "That is the unglamorous part of working with AI. The joke took a minute. Deciding what it must never say took longer."
      ),
    },
    {
      id: "d18",
      date: "2026-12-12",
      cardLine: "If only one person knows how it works, it can't be improved.",
      link: article("key-person-risk-nvidia-ceo-succession"),
      text: p(
        "Something to do this week.",
        "Find one job in your business that only one person knows how to do. Payroll. The quoting spreadsheet. How the schedule really gets built.",
        "Ask them to walk you through it once while you write it down. Not a manual. One page.",
        "You are not doing it because they might leave. You are doing it because right now that process cannot be improved, checked or handed to software. It lives in one head.",
        "More on turning what people know into systems that keep running."
      ),
    },
    {
      id: "d19",
      date: "2026-12-13",
      cardLine: "The goal was never more alerts. It was to stop checking.",
      text: p(
        "My phone tells me when something real happens in the business.",
        "A lead fills in the contact form. A proposal gets signed, or declined with the reason. An invoice gets paid.",
        "Not a daily digest and not forty notifications. A short list of events that mean money moved or someone needs an answer, and each one can be switched off.",
        "The goal was never more alerts. It was to stop checking. If nothing has buzzed, nothing needs me, and I can stay on the work in front of me."
      ),
    },
    {
      id: "d20",
      date: "2026-12-14",
      cardLine: "If email went down tomorrow, how would your crews know where to go?",
      link: article("microsoft-365-outage-business-continuity-plan"),
      text: p(
        "Last month Outlook was down for about a day and a half.",
        "A simple question for a Monday. If email and your calendar disappeared tomorrow morning, how would your crews know where to go?",
        "A plan does not have to be complicated. A saved or printed copy of the week's schedule. Phone numbers stored somewhere that is not the same account. One person who knows they make the calls.",
        "Ten minutes now. I wrote out a fuller version for field crews and clinics."
      ),
    },
    {
      id: "d21",
      date: "2026-12-15",
      cardLine: "Buy what every business needs. Build where your way of working is the advantage.",
      text: p(
        "I built my own business system instead of buying one. I would not tell everyone to do that.",
        "Building made sense for me because it is also what I sell, and because no off-the-shelf tool tied leads, proposals, invoices and my website together the way I wanted.",
        "The cost is real. Every hour spent building is an hour not spent selling, and anything you build is something you maintain.",
        "My rule of thumb. Buy what every business needs. Build only where the way you work is the advantage."
      ),
    },
    {
      id: "d22",
      date: "2026-12-16",
      cardLine: "An AI assistant connected to your apps is an employee with keys.",
      link: article("grok-bot-unprompted-requests-ai-agent-access"),
      text: p(
        "An AI assistant connected to your work apps is an employee with keys.",
        "Last month a security firm reported that two AI assistants on its own employees' accounts made 31 requests to company apps over five days that nobody asked for. Calendar, email, chat, code.",
        "Three checks I'd run on anything you have connected:",
        "What can it read, and what can it change?\nIs there a log of what it touched?\nCan you turn it off in one step?",
        "If you do not know the answers, that is the finding. The full story is here."
      ),
    },
    {
      id: "d23",
      date: "2026-12-17",
      cardLine: "A chatbot with a privacy policy is not private AI.",
      link: article("lawyer-private-ai-server-used-v100-gpus"),
      text: p(
        "Private AI gets used loosely. A chatbot with a privacy policy is not private.",
        "Private means the model runs on a machine you control and your files never leave it. A trial lawyer in South Carolina built exactly that from used parts, so he could ask questions of his case files without sending them anywhere.",
        "His build is rough around the edges. The idea is right, and it applies to any business holding information it cannot hand to a vendor.",
        "The story, and what to take from it."
      ),
    },
    {
      id: "d24",
      date: "2026-12-18",
      cardLine: "Show me what you are about to do before you do it.",
      text: p(
        "One habit I build into anything that acts on its own.",
        "It shows me what it is about to do before it does it.",
        "The tool that loads these daily posts runs as a rehearsal by default. It prints every post, the date it will go out, and anything it would skip. Nothing is written until I run it a second time and say so.",
        "It costs a few extra seconds. In testing it refused to load a batch whose images were not ready, which is exactly the day I would have wanted it to.",
        "If a tool offers you a preview, use it. If it does not, ask why."
      ),
    },
    {
      id: "d25",
      date: "2026-12-19",
      cardLine: "One real AI workflow, running by Friday.",
      link: page("/ai-field-guide"),
      text: p(
        "If you have wanted to try AI in your business and not known where to start, here is a small first step.",
        "I wrote a six-page field guide called Your Best Next Hire Is AI. It is about getting one real workflow running, the kind of task you repeat every week. By Friday you can have it working.",
        "Not a strategy. One workflow, so you can judge for yourself whether it is worth more.",
        "It is free."
      ),
    },
    {
      id: "d26",
      date: "2026-12-20",
      cardLine: "Decide what stays with a person. Then build that rule into the system.",
      text: p(
        "What my AI is not allowed to do.",
        "Move money. Agree a price that is not on my price list. Sign anything. Delete records. Change who can log in.",
        "Those come to me, every time. And anything it writes to someone is signed as an AI, never as me.",
        "People ask how much they should trust AI with. I think that is the wrong question. Decide what stays with a person, write it down, and build the rule into the system so it is not a matter of trust.",
        "The list is short. It should be."
      ),
    },
    {
      id: "d27",
      date: "2026-12-21",
      cardLine: "The gaps between the steps are usually longer than the steps.",
      link: article("hidden-cost-of-broken-workflows"),
      text: p(
        "Broken workflows rarely look broken.",
        "They look like a job that waits a day for an approval. A customer who called twice because the first message did not get passed on. Two people entering the same information in two places.",
        "None of it shows up as a line on a report. It shows up as payroll spent on waiting and redoing.",
        "Pick one process this week and time it from start to finish. The gaps between the steps are usually longer than the steps.",
        "More on where the money goes."
      ),
    },
    {
      id: "d28",
      date: "2026-12-22",
      cardLine: "Who owes you money right now? That answer should never be a week old.",
      text: p(
        "I do not log into my bank to find out if I got paid.",
        "My system checks the business accounts every few hours. When a client pays an invoice by card, I get an alert and the invoice marks itself paid.",
        "The value is not the automation. It is that one question, who owes me money right now, has a current answer without me doing anything.",
        "For most small businesses that answer is a week old and lives in someone's head. It is one of the first things worth fixing."
      ),
    },
    {
      id: "d29",
      date: "2026-12-23",
      cardLine: "Three things you did by hand every week this year. That is next year's list.",
      link: page("/contact"),
      text: p(
        "Before January, make one list.",
        "Three things you or your staff did by hand every single week this year. Copying numbers between systems. Chasing the same status. Sending the same reminder.",
        "For each one, write down roughly how long it takes. Multiply by fifty.",
        "That is your shortlist for next year, in order of hours. No vendor can make that list for you, and it is worth more than any demo.",
        "If you want a second set of eyes on it, send it to me."
      ),
    },
    {
      id: "d30",
      date: "2026-12-24",
      cardLine: "The systems keep running tomorrow. I won't be.",
      text: p(
        "The scheduled jobs do not take tomorrow off. I do.",
        "That was the point of building all this. Not to work more, but to be able to step away and know what is still running.",
        "Merry Christmas from Tomorrow's Tech AI. Thank you for reading along this month."
      ),
    },
  ],
};
