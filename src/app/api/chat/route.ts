import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { WEBSITE_CHAT_PROMPT } from "@/lib/ai/prompts/website-chat";
import { resolveSystemPrompt } from "@/lib/ai/prompt";
import { recordAiUsageAsync } from "@/lib/ai/record";
import { CLAUDE_FAST, effort, refused } from "@/lib/ai/claude";
import { clientIp, dailyBudget, envCap, rateLimitDurable } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Per-visitor limit, plus a site-wide daily cap on model calls so a flood
// from many addresses cannot run up the bill. Both live in src/lib/rate-limit.ts.
const RATE_LIMIT_MAX = 20; // max requests per IP per window
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_DAILY_CAP = 500; // override with CHAT_DAILY_CAP

const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_MESSAGES = 20;

const SYSTEM_PROMPT = WEBSITE_CHAT_PROMPT;

/** Its row in ai_solutions. Usage, cost and health all hang off this. */
const SOLUTION_SLUG = "website-chat";
const MODEL = CLAUDE_FAST;

export async function POST(req: NextRequest) {
  try {
    const limit = await rateLimitDurable(`chat:${clientIp(req)}`, { max: RATE_LIMIT_MAX, windowMs: RATE_LIMIT_WINDOW_MS });
    const remaining = limit.remaining;
    if (!limit.ok) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again in an hour." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
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

    // Checked last, after validation, so a rejected request never spends it.
    const budget = await dailyBudget("chat", envCap("CHAT_DAILY_CAP", DEFAULT_DAILY_CAP));
    if (!budget.ok) {
      console.warn("[chat] daily message cap reached");
      return NextResponse.json(
        { error: "The assistant has hit its limit for today. Please use the contact page and we'll get back to you." },
        { status: 429, headers: { "Retry-After": String(budget.retryAfterSeconds) } }
      );
    }

    const client = new Anthropic({ apiKey });

    // Whichever prompt version is active in the admin, falling back to the
    // constant that shipped with this file. See src/lib/ai/prompt.ts.
    const system = await resolveSystemPrompt(SOLUTION_SLUG, SYSTEM_PROMPT);

    // Groups the turns of one chat without storing anything identifying.
    // The browser sends it back on each request; if it does not, each turn
    // simply counts on its own.
    const conversationRef =
      typeof body.conversationId === "string" && body.conversationId.length <= 64
        ? body.conversationId
        : null;

    const startedAt = Date.now();

    let response;
    try {
      response = await client.messages.create({
        model: MODEL,
        // Room for adaptive thinking plus the reply; low effort keeps chat fast.
        max_tokens: 2048,
        ...effort("low"),
        system,
        messages: recentMessages.map((m: { role: string; content: string }) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      });
    } catch (providerError) {
      // A failed call is usage too — it is most of what the health check
      // reads. Recording it is what turns "the bot feels broken" into a
      // number on the AI Solutions screen.
      recordAiUsageAsync({
        slug: SOLUTION_SLUG,
        model: MODEL,
        status: "error",
        source: "client",
        latencyMs: Date.now() - startedAt,
        error: providerError instanceof Error ? providerError.message : "Provider call failed.",
        conversationRef,
        metadata: { surface: "website", history_length: recentMessages.length },
      });
      throw providerError;
    }

    const textBlock = response.content.find((b) => b.type === "text");
    // A decline (stop_reason "refusal") or an empty reply gets a human answer, not a blank bubble.
    const reply = (textBlock && textBlock.type === "text" ? textBlock.text : "").trim()
      || (refused(response.stop_reason as string)
        ? "That's not something I can help with here. For anything about your business systems, you can reach John directly through the contact page."
        : "Sorry, I lost my train of thought. Could you ask that again?");

    // Fire and forget: bookkeeping must never add latency to a reply.
    recordAiUsageAsync({
      slug: SOLUTION_SLUG,
      model: response.model ?? MODEL,
      inputTokens: response.usage?.input_tokens ?? null,
      outputTokens: response.usage?.output_tokens ?? null,
      latencyMs: Date.now() - startedAt,
      status: "success",
      source: "client",
      conversationRef,
      requestRef: response.id ?? null,
      metadata: {
        surface: "website",
        history_length: recentMessages.length,
        stop_reason: response.stop_reason ?? null,
      },
    });

    return NextResponse.json(
      { reply, remaining, conversationId: conversationRef },
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
