import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { scrub } from "./record";

/**
 * Knowledge sources: what a solution is allowed to know.
 *
 * BE CLEAR ABOUT WHAT THIS DOES AND DOES NOT DO, because the gap matters
 * and a screen that hides it would be lying.
 *
 * What it does: records the sources, fetches the ones it can reach, and
 * measures them — characters, estimated chunks, when they were last read.
 * That is real, it is enough to answer "is this stale?", and it is what
 * the health check reads.
 *
 * What it does NOT do: retrieval. There is no vector store connected to
 * this project, so no source here is being consulted at request time. The
 * Knowledge tab says so in as many words rather than implying a running
 * RAG pipeline, and `embedding_provider` stays null until one exists. The
 * table is shaped for that day — chunk counts, embedding provider and
 * model are already columns — so connecting one is an ingestion job, not
 * a redesign.
 */

const FETCH_TIMEOUT_MS = 15_000;
const MAX_BYTES = 2_000_000;
/** Roughly four characters per token, and about 500 tokens per chunk. */
const CHARS_PER_CHUNK = 2000;

export type SyncResult = {
  ok: boolean;
  status: string;
  message: string;
  documentCount?: number;
  chunkCount?: number;
  sizeBytes?: number;
};

/** Source types this can genuinely read today. */
const FETCHABLE = new Set(["website"]);
const INLINE = new Set(["manual_text", "faq", "policy"]);

export async function syncKnowledgeSource(sourceId: string): Promise<SyncResult> {
  const db = supabaseAdmin();

  const { data, error } = await db
    .from("ai_knowledge_sources")
    .select("id, solution_id, name, source_type, location, content, status")
    .eq("id", sourceId)
    .maybeSingle();

  if (error || !data) return { ok: false, status: "error", message: "That knowledge source no longer exists." };

  const source = data as {
    id: string; solution_id: string; name: string;
    source_type: string; location: string | null; content: string | null; status: string;
  };

  if (source.status === "disabled") {
    return { ok: false, status: "disabled", message: "This source is disabled. Enable it before syncing." };
  }

  const finish = async (result: SyncResult) => {
    await db
      .from("ai_knowledge_sources")
      .update({
        status: result.status,
        last_synced_at: result.ok ? new Date().toISOString() : undefined,
        last_error: result.ok ? null : result.message.slice(0, 500),
        document_count: result.documentCount ?? null,
        chunk_count: result.chunkCount ?? null,
        size_bytes: result.sizeBytes ?? null,
      })
      .eq("id", sourceId);

    await db.from("ai_events").insert({
      solution_id: source.solution_id,
      kind: "knowledge_synced",
      body: result.ok
        ? `Synced knowledge source "${source.name}" — ${result.message}`
        : `Knowledge source "${source.name}" failed to sync: ${result.message}`,
      actor: "system",
    });
    return result;
  };

  // ── Text that is already here ────────────────────────────────────
  if (INLINE.has(source.source_type)) {
    const text = (source.content ?? "").trim();
    if (!text) {
      return finish({ ok: false, status: "error", message: "This source has no text in it yet." });
    }
    const bytes = Buffer.byteLength(text, "utf8");
    return finish({
      ok: true,
      status: "current",
      message: `${text.length.toLocaleString("en-US")} characters read.`,
      documentCount: 1,
      chunkCount: Math.max(1, Math.ceil(text.length / CHARS_PER_CHUNK)),
      sizeBytes: bytes,
    });
  }

  // ── Something we can fetch ───────────────────────────────────────
  if (FETCHABLE.has(source.source_type)) {
    const url = source.location?.trim();
    if (!url) return finish({ ok: false, status: "error", message: "No URL is set on this source." });

    let parsed: URL;
    try {
      parsed = new URL(url.includes("://") ? url : `https://${url}`);
    } catch {
      return finish({ ok: false, status: "error", message: "That is not a valid URL." });
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return finish({ ok: false, status: "error", message: "Only http and https sources can be read." });
    }

    try {
      const response = await fetch(parsed, {
        headers: { "User-Agent": "TomorrowsTechAI-KnowledgeSync/1.0" },
        cache: "no-store",
        redirect: "follow",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (!response.ok) {
        return finish({ ok: false, status: "error", message: `The page answered ${response.status}.` });
      }

      const html = (await response.text()).slice(0, MAX_BYTES);
      const text = htmlToText(html);
      if (text.length < 50) {
        return finish({
          ok: false,
          status: "error",
          message: "The page returned almost no readable text — it may need JavaScript to render.",
        });
      }

      return finish({
        ok: true,
        status: "current",
        message: `${text.length.toLocaleString("en-US")} characters of readable text.`,
        documentCount: 1,
        chunkCount: Math.max(1, Math.ceil(text.length / CHARS_PER_CHUNK)),
        sizeBytes: Buffer.byteLength(html, "utf8"),
      });
    } catch (err) {
      const message = err instanceof Error && err.name === "TimeoutError"
        ? `No response within ${FETCH_TIMEOUT_MS / 1000}s.`
        : scrub(err instanceof Error ? err.message : "The fetch failed.");
      return finish({ ok: false, status: "error", message });
    }
  }

  // ── Everything else ──────────────────────────────────────────────
  // Uploads, databases and API sources need an ingestion job that does not
  // exist yet. Saying so beats marking the row green and moving on.
  return finish({
    ok: false,
    status: "not_synced",
    message:
      "This source type needs an ingestion job that is not connected yet. It is recorded, but nothing has read it.",
  });
}

/** Crude but honest: strip scripts, styles and tags, collapse whitespace. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True when no vector store is connected anywhere, which is what the
 * Knowledge tab uses to explain that sources are tracked but not retrieved.
 */
export async function retrievalConnected(): Promise<boolean> {
  const { data } = await supabaseAdmin()
    .from("ai_integrations")
    .select("id")
    .eq("provider", "vector_store")
    .eq("status", "connected")
    .limit(1);
  return ((data ?? []) as { id: string }[]).length > 0;
}
