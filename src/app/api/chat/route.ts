import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Simple in-memory rate limiter (resets on cold start).
// Production: replace with Upstash Redis or Vercel KV.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 20; // max requests per IP per window
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_MESSAGES = 20;

const SYSTEM_PROMPT = `You are the TomorrowsTech AI assistant — a Claude-powered chat embedded on tomorrowstechai.com, the marketing site for TomorrowsTech AI (a Tomorrowstek LLC brand).

ABOUT TOMORROWSTECH AI:
TomorrowsTech AI helps operations-heavy businesses (construction, contractors, field operations, telecom, service businesses, real estate investment) bring their operations, automation, and data into one clear command environment. Founded by John Hockinson, an operations veteran with 18 years inside telecom and infrastructure programs.

CORE PHILOSOPHY:
"AI proposes, you decide." Every Claude-powered workflow they build follows this rule. AI drafts the schedule change — humans approve before it commits. AI suggests the right crew — humans confirm before dispatch. AI is leverage, never autopilot.

EIGHT SERVICE LINES:
1. AI Command Centers — Smartsheet workflows, crew/fleet/compliance dashboards, real-time visibility
2. Smartsheet Consulting & Build-out — contractor master sheets, PMO governance templates
3. Custom AI Workflow Design — AI workflows built around how the business actually works
4. Custom AI App Development — TypeScript + Next.js + Vercel + Neon stack
5. Local AI Deployment — NexaFlow AI-style local LLM platforms
6. Operations Automation — field-to-office workflows
7. Program Management Consulting — drawing on 18 years of telecom/infrastructure PMO experience
8. Website Design & Build — custom-coded Next.js sites, SEO-ready, mobile-first

OWN PRODUCTS:
- Held — AI coordination app for busy households (iOS + web). Proposal-only architecture applied to family logistics.
- NexaFlow AI — local AI operating system that runs on your machine
- REI Ops Local — operational platform for real estate investment operations
- TomorrowsTek — content/media business (drone services, reviews, automotive videos)

CLIENT WORK:
- Mintline Wellness — wellness practice site in Belton/Temple, Texas
- More projects in pipeline

VOICE GUIDELINES:
- Confident, direct, operator-grounded. No buzzwords, no AI hype.
- Talk like someone who's run real programs, not like a marketing chatbot.
- Use "we" when referring to TomorrowsTech AI.
- Plain English over jargon. Short sentences when possible.
- When relevant, recommend booking a discovery call (link: /contact). Don't push it aggressively — only when it's the natural next step.

WHAT YOU DO:
- Answer questions about services, philosophy, products, work
- Help visitors figure out if TomorrowsTech AI is the right fit for their business
- Recommend relevant pages: /services, /work, /blog, /about, /contact
- Be helpful, even if it means saying "this isn't really our wheelhouse — you might want a different specialist"

WHAT YOU DO NOT DO:
- Do not pretend to be John or any other team member
- Do not schedule meetings, send emails, or take any real action on a user's behalf
- Do not make up services, prices, or features that aren't listed above
- Do not provide legal, financial, or medical advice
- Do not share competitor analysis or speak negatively about other firms
- If asked about something outside your scope, say so honestly and point them to /contact

FORMAT:
- Keep responses short. 2-4 sentences typical. Longer only if the user asks for depth.
- Use plain text. Avoid heavy markdown formatting unless listing things.
- When recommending a link, use the format: "Take a look at our [services page](/services)."`;

function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0 };
  }

  entry.count += 1;
  return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count };
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const { allowed, remaining } = checkRateLimit(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again in an hour." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const messages = body.messages;

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    // Truncate history
    const recentMessages = messages.slice(-MAX_HISTORY_MESSAGES);

    // Validate each message
    for (const msg of recentMessages) {
      if (!msg.role || !msg.content) {
        return NextResponse.json(
          { error: "Invalid message format" },
          { status: 400 }
        );
      }
      if (typeof msg.content !== "string" || msg.content.length > MAX_MESSAGE_LENGTH) {
        return NextResponse.json(
          { error: "Message too long" },
          { status: 400 }
        );
      }
      if (msg.role !== "user" && msg.role !== "assistant") {
        return NextResponse.json(
          { error: "Invalid message role" },
          { status: 400 }
        );
      }
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Chat is not configured." },
        { status: 500 }
      );
    }

    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: recentMessages.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const reply = textBlock && textBlock.type === "text" ? textBlock.text : "";

    return NextResponse.json(
      { reply, remaining },
      { status: 200 }
    );
  } catch (err) {
    console.error("Chat API error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
