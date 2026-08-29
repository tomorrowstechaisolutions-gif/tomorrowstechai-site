import { NextResponse } from "next/server";
import { sendCapiEvent, type CapiEventName } from "@/lib/meta/capi";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { CAMPAIGN_NAME, OFFER_PRICE } from "@/lib/campaign/config";

export const runtime = "nodejs";

/**
 * Server half of the browser conversions. The client sends the event_id it
 * already gave the pixel, so Meta counts the pair once.
 *
 * Monetary values are set HERE, not taken from the request body — otherwise
 * anyone could POST a $1,000,000 Purchase and poison the optimisation. Upsell
 * revenue is recorded in the admin instead, where a human enters it.
 */
const ALLOWED: CapiEventName[] = [
  "ViewContent",
  "Lead",
  "Contact",
  "Schedule",
  "InitiateCheckout",
  "Purchase",
];

const SERVER_VALUED: Partial<Record<CapiEventName, number>> = {
  InitiateCheckout: OFFER_PRICE,
  Purchase: OFFER_PRICE,
  Lead: OFFER_PRICE,
};

export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    const limit = rateLimit(`track:${ip}`, { max: 60, windowMs: 10 * 60 * 1000 });
    if (!limit.ok) return NextResponse.json({ ok: false }, { status: 429 });

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const event = body.event as CapiEventName;
    if (!ALLOWED.includes(event)) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const eventId = typeof body.event_id === "string" ? body.event_id.slice(0, 100) : "";
    if (!eventId) return NextResponse.json({ ok: false }, { status: 400 });

    const custom: Record<string, unknown> = {
      content_name: CAMPAIGN_NAME,
      ...(typeof body.custom_data === "object" && body.custom_data
        ? (body.custom_data as Record<string, unknown>)
        : {}),
    };
    delete custom.value;
    delete custom.currency;

    const value = SERVER_VALUED[event];
    if (value !== undefined) {
      custom.value = value;
      custom.currency = "USD";
    }

    const result = await sendCapiEvent({
      eventName: event,
      eventId,
      eventSourceUrl:
        typeof body.source_url === "string" ? body.source_url.slice(0, 500) : null,
      user: {
        email: typeof body.email === "string" ? body.email.slice(0, 200) : null,
        phone: typeof body.phone === "string" ? body.phone.slice(0, 40) : null,
        country: "us",
        fbp: typeof body.fbp === "string" ? body.fbp.slice(0, 200) : null,
        fbc: typeof body.fbc === "string" ? body.fbc.slice(0, 500) : null,
        clientIp: ip,
        userAgent: req.headers.get("user-agent"),
      },
      customData: custom,
    });

    return NextResponse.json({ ok: result.ok, skipped: result.skipped ?? false });
  } catch (err) {
    console.error("Track route error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
