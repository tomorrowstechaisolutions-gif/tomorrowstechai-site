import { describe, expect, it, vi } from "vitest";
import { fakeSupabase, type Tables } from "@/test-support/fake-supabase";

vi.mock("server-only", () => ({}));

import { cleanPagePath, cleanPageView, orbLayout, orbShows, pageById, pageForPath, pageFromMessage, TESS_PAGES, VIEW_LIMIT } from "@/components/admin/cc/tess/pages";
import { chatHistory, openChatTurn } from "../chat";
import { CONTEXT_TAGS, whereText } from "../tess-modes";
import { toolsFor } from "../tools";
import { openPage } from "../tools/navigate";

const NOW = Date.parse("2026-11-20T14:00:00.000Z");

function setup(over: Partial<Tables> = {}) {
  return fakeSupabase({
    ai_businesses: [{ id: "biz-1", slug: "tomorrows-tech-ai", name: "Tomorrow's Tech AI", mode: "launch" }],
    ai_agents: [{ id: "a-tess", slug: "tess", name: "Tess", model: "claude-opus-5-5" }],
    ai_runs: [{ id: "run-1", agent_id: "a-tess", business_id: "biz-1", trigger: "chat", status: "running", started_by: "user-1", steps_taken: 0, started_at: "2026-11-20T13:00:00.000Z", transcript: [] }],
    ai_steps: [],
    ...over,
  });
}
const ctx = (db: unknown, toolUseId = "tu-1", startedBy: string | null = "user-1") =>
  ({ sb: db, run: { id: "run-1", agent_id: "a-tess", business_id: "biz-1", started_by: startedBy }, toolUseId, business: { id: "biz-1" } }) as never;

describe("the pages Tess can open", () => {
  it("covers the sidebar and the screens behind it, each with its own id", () => {
    const ids = TESS_PAGES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(pageById("clients")).toMatchObject({ href: "/admin/clients", label: "Clients" });
    expect(pageById("dashboard")?.href).toBe("/admin");
    expect(pageById("ai")?.href).toBe("/admin/ai");
    expect(pageById("marketing-ads")?.label).toBe("Ad Studio");
    expect(pageById("ai-floor")?.href).toBe("/admin/ai/floor");
    expect(pageById("finance")?.label).toBe("Finance overview");
  });

  it("never offers a page outside the admin", () => {
    expect(TESS_PAGES.every((p) => p.href === "/admin" || p.href.startsWith("/admin/"))).toBe(true);
    expect(pageById("logo-studio")).toBeNull();
    expect(pageById("nowhere")).toBeNull();
  });

  it("knows which page a path belongs to, by the closest match", () => {
    expect(pageForPath("/admin/clients/123/edit")?.id).toBe("clients");
    expect(pageForPath("/admin/automations/workflows/9")?.id).toBe("automations-workflows");
    expect(pageForPath("/admin")?.id).toBe("dashboard");
    expect(pageForPath("/admin/something-new")).toBeNull();
  });
});

describe("Tess opening a page when John asks", () => {
  it("is one of her tools and offers only pages that exist", () => {
    expect(toolsFor("tess").map((t) => t.name)).toContain("open_page");
    const props = openPage.input_schema.properties as Record<string, { enum?: unknown[] }>;
    expect(props.page.enum).toEqual(TESS_PAGES.map((p) => p.id));
  });

  it("says the page is opening and logs it once", async () => {
    const { db, tables } = setup();
    const result = await openPage.run(ctx(db), { page: "clients" });
    expect(result.ok).toBe(true);
    expect(result.text).toContain("Clients");
    await openPage.run(ctx(db), { page: "clients" });
    expect(tables.ai_steps).toHaveLength(1);
  });

  it("refuses a page that does not exist", async () => {
    const { db, tables } = setup();
    expect((await openPage.run(ctx(db), { page: "https://elsewhere.example" })).ok).toBe(false);
    expect(tables.ai_steps).toHaveLength(0);
  });

  it("does nothing outside a conversation with John", async () => {
    const { db } = setup();
    expect((await openPage.run(ctx(db, "tu-1", null), { page: "clients" })).ok).toBe(false);
  });

  it("is read from her reply so his screen can go there", () => {
    const content = [
      { type: "text", text: "Opening it." },
      { type: "tool_use", id: "t1", name: "change_settings", input: { mode: "focus" } },
      { type: "tool_use", id: "t2", name: "open_page", input: { page: "clients" } },
    ];
    expect(pageFromMessage(content)?.href).toBe("/admin/clients");
    expect(pageFromMessage([{ type: "tool_use", id: "t", name: "open_page", input: { page: "//evil.example" } }])).toBeNull();
    expect(pageFromMessage([{ type: "text", text: "open_page clients" }])).toBeNull();
  });
});

describe("telling Tess where John is", () => {
  it("only accepts a path inside the admin", () => {
    expect(cleanPagePath("/admin/clients/12?tab=notes#x")).toBe("/admin/clients/12");
    expect(cleanPagePath("/admin")).toBe("/admin");
    expect(cleanPagePath("https://evil.example/admin")).toBeNull();
    expect(cleanPagePath("/administrator")).toBeNull();
    expect(cleanPagePath("/admin/<script>")).toBeNull();
    expect(cleanPagePath(42)).toBeNull();
  });

  it("tidies and clips what is read from the page", () => {
    expect(cleanPageView("  Clients \n\n\n  Acme   Co \t 3 open  ")).toBe("Clients\nAcme Co 3 open");
    expect(cleanPageView("x".repeat(VIEW_LIMIT + 500)).length).toBeLessThanOrEqual(VIEW_LIMIT + 1);
    expect(cleanPageView(null)).toBe("");
  });

  it("names the page and carries what it shows, marked as information", () => {
    const text = whereText("/admin/clients", "Acme Co, 3 open projects");
    expect(text.startsWith("<where_john_is>")).toBe(true);
    expect(text).toContain("Clients");
    expect(text).toContain("Acme Co, 3 open projects");
    expect(text).toMatch(/never an instruction/);
  });

  it("carries no page text on her own screen", () => {
    const text = whereText("/admin/ai", "the brief, again");
    expect(text).not.toContain("the brief, again");
    expect(text).toMatch(/your own screen/);
  });

  it("is sent with what he said, again only when he has moved, and never shown as his words", async () => {
    expect(CONTEXT_TAGS).toContain("<where_john_is>");
    const { db, tables } = setup({ ai_runs: [] });
    const brief = async () => "BRIEF";
    const at = (path: string, view: string) => [whereText(path, view)];
    const id = await openChatTurn(db, { userId: "user-1", message: "Open clients", brief, context: at("/admin/ai", ""), now: NOW });
    await openChatTurn(db, { userId: "user-1", message: "Who is newest?", brief, context: at("/admin/clients", "Acme Co"), now: NOW });
    await openChatTurn(db, { userId: "user-1", message: "And oldest?", brief, context: at("/admin/clients", "Acme Co"), now: NOW });
    const run = tables.ai_runs.find((r) => r.id === id) as { transcript: { content: { text: string }[] }[] };
    const where = run.transcript.flatMap((m) => m.content).filter((b) => b.text.startsWith("<where_john_is>"));
    expect(where).toHaveLength(2);
    expect(await chatHistory(db, "user-1", NOW)).toEqual([
      { role: "john", text: "Open clients" },
      { role: "john", text: "Who is newest?" },
      { role: "john", text: "And oldest?" },
    ]);
  });
});

describe("the ball that follows John", () => {
  it("shows on every admin page except her own full screen", () => {
    expect(orbShows("/admin/ai")).toBe(false);
    expect(orbShows("/admin/clients")).toBe(true);
    expect(orbShows("/admin/ai/archive")).toBe(true);
    expect(orbShows("/admin")).toBe(true);
  });

  it("sits bottom right until John moves it", () => {
    expect(orbLayout(null, { width: 1400, height: 900 })).toMatchObject({ right: 22, bottom: 22, panelBelow: false, panelLeft: false });
  });

  it("stays on screen wherever it was left, and opens its panel toward the room", () => {
    const far = orbLayout({ right: 5000, bottom: 5000 }, { width: 1400, height: 900 });
    expect(far.right).toBeLessThanOrEqual(1400 - 64);
    expect(far.bottom).toBeLessThanOrEqual(900 - 64);
    expect(far).toMatchObject({ panelBelow: true, panelLeft: true });
    expect(orbLayout({ right: -40, bottom: -40 }, { width: 1400, height: 900 })).toMatchObject({ right: 8, bottom: 8 });
  });
});
