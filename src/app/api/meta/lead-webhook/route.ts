import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { intakeLead } from "@/lib/campaign/intake";
import { sendAdminNotification, sendLeadConfirmation } from "@/lib/campaign/emails";
import {
  BUSINESS_TYPES,
  CAMPAIGN_NAME,
  SERVICE_OPTIONS,
  TIMELINES,
} from "@/lib/campaign/config";

export const runtime = "nodejs";

/**
 * Meta Instant Form (Lead Ads) webhook.
 *
 * Dormant until META_WEBHOOK_VERIFY_TOKEN, META_APP_SECRET and
 * META_PAGE_ACCESS_TOKEN are set — the endpoint answers, but refuses to act.
 *
 * Instant Form leads land in exactly the same pipeline as website leads:
 * same table, same dedupe by email/phone, same scoring, same follow-up queue.
 * They are tagged source = "facebook" and keep whatever campaign/ad
 * attribution Meta hands over.
 */

const GRAPH = "https://graph.facebook.com/v21.0";

/** GET — Meta's subscription handshake. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (!expected) {
    return new NextResponse("Webhook not configured", { status: 503 });
  }

  const provided = token ?? "";
  const match =
    provided.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));

  if (mode === "subscribe" && match && challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

/** Constant-time HMAC-SHA256 check over the RAW body. */
function verifySignature(raw: string, header: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !header) return false;

  const [algo, signature] = header.split("=");
  if (algo !== "sha256" || !signature) return false;

  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(signature, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

type MetaField = { name?: string; values?: string[] };

/** Meta field names are whatever the form author typed. Match generously. */
function fieldValue(fields: MetaField[], ...needles: string[]): string {
  for (const needle of needles) {
    const hit = fields.find((f) =>
      (f.name ?? "").toLowerCase().replace(/[\s_-]/g, "").includes(needle)
    );
    const value = hit?.values?.[0];
    if (value) return String(value).trim();
  }
  return "";
}

function matchOption<T extends readonly string[]>(
  list: T,
  raw: string
): T[number] | null {
  if (!raw) return null;
  const norm = raw.toLowerCase().trim();
  const exact = (list as readonly string[]).find((o) => o.toLowerCase() === norm);
  if (exact) return exact as T[number];
  const partial = (list as readonly string[]).find(
    (o) => norm.includes(o.toLowerCase()) || o.toLowerCase().includes(norm)
  );
  return (partial as T[number]) ?? null;
}

export async function POST(req: Request) {
  // Meta retries aggressively. Always answer 200 for anything we've seen and
  // handled — a non-2xx makes it redeliver forever.
  const raw = await req.text();

  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"))) {
    return new NextResponse("Invalid signature", { status: 403 });
  }

  const pageToken = process.env.META_PAGE_ACCESS_TOKEN;
  if (!pageToken) {
    console.error("Meta lead webhook: META_PAGE_ACCESS_TOKEN is not set.");
    return NextResponse.json({ ok: true, skipped: "not_configured" });
  }

  let payload: {
    entry?: {
      changes?: { field?: string; value?: Record<string, unknown> }[];
    }[];
  };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true, skipped: "unparseable" });
  }

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen") continue;
      const v = change.value ?? {};
      const leadgenId = typeof v.leadgen_id === "string" ? v.leadgen_id : null;
      if (!leadgenId) continue;

      try {
        const res = await fetch(
          `${GRAPH}/${leadgenId}?access_token=${encodeURIComponent(pageToken)}`
        );
        if (!res.ok) {
          console.error("Meta leadgen fetch failed:", res.status);
          continue;
        }
        const detail = (await res.json()) as {
          field_data?: MetaField[];
          campaign_name?: string;
          adset_name?: string;
          ad_name?: string;
          platform?: string;
          form_id?: string;
        };

        const fields = detail.field_data ?? [];

        const fullName = fieldValue(fields, "fullname", "name");
        const first =
          fieldValue(fields, "firstname") || fullName.split(" ")[0] || "Unknown";
        const last =
          fieldValue(fields, "lastname") ||
          fullName.split(" ").slice(1).join(" ") ||
          "Lead";

        const email = fieldValue(fields, "email");
        if (!email) {
          console.error("Meta lead has no email; skipping:", leadgenId);
          continue;
        }

        const services = fields
          .filter((f) =>
            (f.name ?? "").toLowerCase().replace(/[\s_-]/g, "").includes("need")
          )
          .flatMap((f) => f.values ?? [])
          .map((raw) => matchOption(SERVICE_OPTIONS, String(raw)))
          .filter((s): s is (typeof SERVICE_OPTIONS)[number] => Boolean(s));

        const websiteRaw = fieldValue(fields, "website", "havewebsite").toLowerCase();
        const currentWebsite =
          websiteRaw.startsWith("y") ? "yes" : websiteRaw.startsWith("n") ? "no" : null;

        const result = await intakeLead({
          first_name: first,
          last_name: last,
          email,
          phone: fieldValue(fields, "phone", "phonenumber"),
          business_name: fieldValue(fields, "businessname", "company"),
          business_type: matchOption(BUSINESS_TYPES, fieldValue(fields, "businesstype", "industry", "trade")),
          current_website: currentWebsite,
          services_interested: Array.from(new Set(services)),
          timeline: matchOption(TIMELINES, fieldValue(fields, "timeline", "started", "when")),
          source: "facebook",
          campaign: detail.campaign_name ?? CAMPAIGN_NAME,
          adset: detail.adset_name ?? null,
          ad: detail.ad_name ?? null,
          placement: detail.platform ?? null,
          utm_source: "facebook",
          utm_medium: "paid_social",
          utm_campaign: detail.campaign_name ?? CAMPAIGN_NAME,
          landing_page: "meta_instant_form",
          meta_leadgen_id: leadgenId,
          meta_form_id: detail.form_id ?? (typeof v.form_id === "string" ? v.form_id : null),
          meta_page_id: typeof v.page_id === "string" ? v.page_id : null,
          email_consent: true,
          // Meta Instant Forms don't collect SMS consent unless the form
          // author adds a consent question. Never assume it.
          sms_consent: false,
          consent_text: "Submitted a Meta Instant Form for the $399 Business Launch offer.",
        });

        if (!result.duplicate) {
          await Promise.all([
            sendLeadConfirmation({ firstName: first, email }),
            sendAdminNotification({
              leadId: result.leadId,
              firstName: first,
              lastName: last,
              email,
              phone: fieldValue(fields, "phone", "phonenumber"),
              businessName: fieldValue(fields, "businessname", "company"),
              businessType: matchOption(BUSINESS_TYPES, fieldValue(fields, "businesstype", "industry", "trade")),
              currentWebsite,
              services: Array.from(new Set(services)),
              timeline: matchOption(TIMELINES, fieldValue(fields, "timeline", "started", "when")),
              score: result.score,
              reasons: result.reasons,
              duplicate: result.duplicate,
              stored: result.stored,
              source: "facebook",
              campaign: detail.campaign_name ?? CAMPAIGN_NAME,
              ad: detail.ad_name ?? null,
              placement: detail.platform ?? null,
              landingPage: "Meta Instant Form",
            }),
          ]);
        }
      } catch (err) {
        console.error("Meta lead processing error:", err);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
