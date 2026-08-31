import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { supabaseConfigured } from "@/lib/supabase/admin";
import { addFile, getIntakeByToken, removeFile } from "@/lib/intake/service";
import { ACCEPTED_MIME, FILE_KINDS, MAX_FILE_BYTES, type FileKind } from "@/lib/intake/config";

export const runtime = "nodejs";

const KINDS = FILE_KINDS.map((k) => k.value) as readonly string[];

async function open(token: unknown) {
  if (typeof token !== "string") return { error: "Invalid request.", status: 400 as const };
  const loaded = await getIntakeByToken(token);
  if (loaded === "not_found") return { error: "That link is not valid.", status: 404 as const };
  if (loaded === "expired") return { error: "That link has expired.", status: 410 as const };
  if (loaded.intake.status === "submitted") {
    return { error: "This intake has already been submitted.", status: 409 as const };
  }
  return { loaded };
}

export async function POST(req: Request) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const ip = clientIp(req);
  const limit = rateLimit(`intake-upload:${ip}`, { max: 60, windowMs: 60 * 60 * 1000 });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many uploads. Give it a minute." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const opened = await open(form.get("token"));
  if ("error" in opened) {
    return NextResponse.json({ error: opened.error }, { status: opened.status });
  }

  const kindRaw = form.get("kind");
  const kind = typeof kindRaw === "string" && KINDS.includes(kindRaw)
    ? (kindRaw as FileKind)
    : null;
  if (!kind) return NextResponse.json({ error: "Unknown file type." }, { status: 400 });

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No file received." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "That file is larger than 25MB." }, { status: 413 });
  }
  if (!(ACCEPTED_MIME as readonly string[]).includes(file.type)) {
    return NextResponse.json(
      { error: "Images and PDFs only, please." },
      { status: 415 }
    );
  }

  try {
    const saved = await addFile(opened.loaded.intake, kind, file);
    return NextResponse.json({ ok: true, file: saved });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || typeof body.fileId !== "string") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const opened = await open(body.token);
  if ("error" in opened) {
    return NextResponse.json({ error: opened.error }, { status: opened.status });
  }

  await removeFile(opened.loaded.intake, body.fileId);
  return NextResponse.json({ ok: true });
}
