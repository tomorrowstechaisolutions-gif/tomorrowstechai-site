import { NAV_GROUPS } from "../nav";

/**
 * Going places with Tess: the pages she can open when John asks, where he
 * is right now, and where the small ball that follows him sits. Kept apart
 * from the browser so it can be tested, and shared by her tool (server) and
 * the page (browser).
 */

export type TessPage = { id: string; href: string; label: string };

/** Screens that sit behind a sidebar entry and have no entry of their own. */
const BEHIND: { href: string; label: string }[] = [
  { href: "/admin/ai/floor", label: "Crew floor" },
  { href: "/admin/ai/archive", label: "Chat archive" },
  { href: "/admin/hosting", label: "Hosting" },
  { href: "/admin/conference-center", label: "Conference Center" },
  { href: "/admin/catalog", label: "Catalog" },
  { href: "/admin/software", label: "Software" },
];

const idOf = (href: string) => (href === "/admin" ? "dashboard" : href.replace(/^\/admin\//, "").replace(/\//g, "-"));

/** Every page Tess can open: the sidebar, in its order, then the screens behind it. Admin pages only. */
export const TESS_PAGES: TessPage[] = [
  ...NAV_GROUPS.flatMap((group) =>
    group.links.filter((link) => !link.external && !link.soon).map((link) => ({ href: link.href, label: link.label === "Overview" ? `${group.head} overview` : link.label }))
  ),
  ...BEHIND,
]
  .filter((page) => page.href === "/admin" || page.href.startsWith("/admin/"))
  .map((page) => ({ id: idOf(page.href), ...page }));

export function pageById(id: unknown): TessPage | null {
  return TESS_PAGES.find((p) => p.id === id) ?? null;
}

/** The page a path belongs to: the one whose address matches the most of it. */
export function pageForPath(pathname: string): TessPage | null {
  let best: TessPage | null = null;
  for (const page of TESS_PAGES) {
    const hit = page.href === "/admin" ? pathname === "/admin" : pathname === page.href || pathname.startsWith(`${page.href}/`);
    if (hit && (!best || page.href.length > best.href.length)) best = page;
  }
  return best;
}

/** The tool Tess opens a page with. */
export const OPEN_PAGE_TOOL = "open_page";

/** The page Tess asked to open in one reply, read from its tool calls. Null when she opened none. */
export function pageFromMessage(content: unknown): TessPage | null {
  if (!Array.isArray(content)) return null;
  let page: TessPage | null = null;
  for (const block of content as { type?: string; name?: string; input?: { page?: unknown } }[]) {
    if (block?.type !== "tool_use" || block.name !== OPEN_PAGE_TOOL) continue;
    page = pageById(block.input?.page) ?? page;
  }
  return page;
}

/** A path sent by the browser, kept only if it is a plain address inside the admin. */
export function cleanPagePath(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const path = input.split(/[?#]/)[0];
  if (path.length > 200) return null;
  return /^\/admin(\/[\w\-.[\]]+)*$/.test(path) ? path : null;
}

/** How much of a page's text Tess is given. */
export const VIEW_LIMIT = 4000;

/** The text read from the page John is on: one tidy line per line, blank lines dropped, clipped. */
export function cleanPageView(input: unknown): string {
  if (typeof input !== "string") return "";
  const text = input
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  return text.length > VIEW_LIMIT ? `${text.slice(0, VIEW_LIMIT)}…` : text;
}

/** The ball shows wherever Tess is not already full screen. */
export function orbShows(pathname: string): boolean {
  return pathname !== "/admin/ai";
}

export const ORB_KEY = "tess-orb";
export const ORB_EVENT = "tess-orb-change";
export const ORB_SIZE = 64;
const ORB_EDGE = 8;
const ORB_HOME = 22;

export type OrbSpot = { right: number; bottom: number };

/** Where John left the ball, read from what was saved. Null when he never moved it. */
export function parseOrbSpot(raw: string | null): OrbSpot | null {
  if (!raw) return null;
  try {
    const spot = JSON.parse(raw) as Partial<OrbSpot>;
    return Number.isFinite(spot.right) && Number.isFinite(spot.bottom) ? { right: Number(spot.right), bottom: Number(spot.bottom) } : null;
  } catch {
    return null;
  }
}

/**
 * Where the ball goes on a screen of this size: bottom right until John
 * moves it, always fully on screen, with its panel opening toward the
 * middle of the screen.
 */
export function orbLayout(spot: OrbSpot | null, viewport: { width: number; height: number }) {
  const clamp = (value: number, room: number) => Math.round(Math.max(ORB_EDGE, Math.min(value, Math.max(ORB_EDGE, room - ORB_SIZE - ORB_EDGE))));
  const right = clamp(spot?.right ?? ORB_HOME, viewport.width);
  const bottom = clamp(spot?.bottom ?? ORB_HOME, viewport.height);
  return {
    right,
    bottom,
    /** The ball is in the top half: the panel opens under it. */
    panelBelow: bottom + ORB_SIZE / 2 > viewport.height / 2,
    /** The ball is in the left half: the panel lines up with its left edge. */
    panelLeft: right + ORB_SIZE / 2 > viewport.width / 2,
  };
}
