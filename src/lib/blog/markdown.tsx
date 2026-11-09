import Image from "next/image";
import type { ReactNode } from "react";

/**
 * Field Notes Markdown → React.
 *
 * Output is React elements, never an HTML string, so article text is escaped
 * by React. That matters once bodies come from the Admin Center instead of a
 * file a developer reviewed.
 *
 * Supported (blocks are separated by blank lines):
 *   ## / ### / #### Heading        → h2–h4 with a stable id for the TOC
 *   - item / * item                → bulleted list
 *   1. item                        → numbered list
 *   > quote                        → blockquote
 *   > [!NOTE] Optional title       → callout. Types: NOTE, TIP, WARNING,
 *                                    DISCREPANCY, CORRECTION, UPDATE
 *   | a | b | + |---|---|          → table (":--" / ":-:" / "--:" align)
 *   ```lang                        → code block
 *   ![alt](/path.webp "Caption | Credit")  on its own line → figure
 *   ---                            → divider
 * Inline: **bold**, *italic*, `code`, [text](https://…), [text](/path),
 *   [^source-id] → numbered citation linking to the article's sources list.
 *
 * Paragraphs end only at a blank line. That keeps the seven pre-Field-Notes
 * articles rendering exactly as they did with the old renderer.
 */

export type RenderOptions = {
  /** Source ids in display order; [^id] renders as its 1-based position. */
  sourceIds?: string[];
};

type Ctx = {
  citeNumber: Map<string, number>;
  headingIds: Set<string>;
};

export type Heading = { id: string; text: string; level: 2 | 3 | 4 };

export const CALLOUT_TYPES = ["NOTE", "TIP", "WARNING", "DISCREPANCY", "CORRECTION", "UPDATE"] as const;
type CalloutType = (typeof CALLOUT_TYPES)[number];
const CALLOUT_LABEL: Record<CalloutType, string> = {
  NOTE: "Note",
  TIP: "Tip",
  WARNING: "Warning",
  DISCREPANCY: "Sources disagree",
  CORRECTION: "Correction",
  UPDATE: "Update",
};

// ── Block parsing ─────────────────────────────────────────────────────

type Align = "left" | "center" | "right" | null;
type Block =
  | { kind: "heading"; level: 2 | 3 | 4; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "ul" | "ol"; items: string[]; start: number }
  | { kind: "quote"; blocks: Block[] }
  | { kind: "callout"; type: CalloutType; title: string | null; blocks: Block[] }
  | { kind: "table"; head: string[]; align: Align[]; rows: string[][] }
  | { kind: "code"; lang: string | null; code: string }
  | { kind: "figure"; alt: string; src: string; caption: string | null; credit: string | null }
  | { kind: "hr" };

const HEADING = /^(#{2,4})\s+(.+?)(?:\s+#+)?\s*$/;
const UL_ITEM = /^[-*]\s+(.*)$/;
const OL_ITEM = /^(\d{1,3})[.)]\s+(.*)$/;
const FENCE = /^```\s*([\w+-]*)\s*$/;
const HR = /^(?:-{3,}|\*{3,}|_{3,})\s*$/;
const TABLE_SEP = /^\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;
const FIGURE = /^!\[([^\]]*)\]\(\s*(\S+?)(?:\s+"([^"]*)")?\s*\)\s*$/;
const CALLOUT_HEAD = /^\[!([A-Z]+)\]\s*(.*)$/;

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && s[i + 1] === "|") {
      cur += "|";
      i++;
    } else if (s[i] === "|") {
      cells.push(cur.trim());
      cur = "";
    } else {
      cur += s[i];
    }
  }
  cells.push(cur.trim());
  return cells;
}

function parseAlign(cell: string): Align {
  const c = cell.trim();
  const l = c.startsWith(":");
  const r = c.endsWith(":");
  if (l && r) return "center";
  if (r) return "right";
  if (l) return "left";
  return null;
}

export function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  const blank = (l: string | undefined) => l === undefined || l.trim() === "";

  while (i < lines.length) {
    const line = lines[i];
    if (blank(line)) {
      i++;
      continue;
    }

    const fence = line.match(FENCE);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++; // closing fence (or end of input)
      blocks.push({ kind: "code", lang: fence[1] || null, code: body.join("\n") });
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length as 2 | 3 | 4, text: heading[2] });
      i++;
      continue;
    }

    if (HR.test(line)) {
      blocks.push({ kind: "hr" });
      i++;
      continue;
    }

    if (line.trimStart().startsWith("|") && TABLE_SEP.test(lines[i + 1] ?? "")) {
      const head = splitRow(line);
      const align = splitRow(lines[i + 1]).map(parseAlign);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trimStart().startsWith("|")) rows.push(splitRow(lines[i++]));
      blocks.push({ kind: "table", head, align, rows });
      continue;
    }

    if (line.startsWith(">")) {
      const inner: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) inner.push(lines[i++].replace(/^>\s?/, ""));
      const callout = inner[0]?.match(CALLOUT_HEAD);
      if (callout && (CALLOUT_TYPES as readonly string[]).includes(callout[1])) {
        blocks.push({
          kind: "callout",
          type: callout[1] as CalloutType,
          title: callout[2].trim() || null,
          blocks: parseBlocks(inner.slice(1).join("\n")),
        });
      } else {
        blocks.push({ kind: "quote", blocks: parseBlocks(inner.join("\n")) });
      }
      continue;
    }

    const ul = line.match(UL_ITEM);
    const ol = line.match(OL_ITEM);
    if (ul || ol) {
      const ordered = !ul;
      const marker = ordered ? OL_ITEM : UL_ITEM;
      const items: string[] = [];
      const start = ol ? Number(ol[1]) : 1;
      while (i < lines.length && !blank(lines[i])) {
        const m = lines[i].match(marker);
        if (m) items.push(ordered ? m[2] : m[1]);
        else items[items.length - 1] += " " + lines[i].trim();
        i++;
      }
      blocks.push({ kind: ordered ? "ol" : "ul", items, start });
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && !blank(lines[i])) para.push(lines[i++]);
    const fig = para.length === 1 ? para[0].match(FIGURE) : null;
    if (fig) {
      const [caption, credit] = (fig[3] ?? "").split(/\s+\|\s+/);
      blocks.push({
        kind: "figure",
        alt: fig[1],
        src: fig[2],
        caption: caption?.trim() || null,
        credit: credit?.trim() || null,
      });
    } else {
      blocks.push({ kind: "paragraph", text: para.join("\n") });
    }
  }
  return blocks;
}

// ── Inline ────────────────────────────────────────────────────────────

const INLINE =
  /(`([^`\n]+)`)|(\[\^([a-z0-9][a-z0-9-]*)\])|(\[((?:[^[\]]|\[[^\]]*\])+)\]\(\s*([^)\s]+)\s*\))|(\*\*(.+?)\*\*)|(\*(.+?)\*)/g;

export function isSafeHref(href: string): boolean {
  return /^(https?:\/\/|\/(?!\/)|#|mailto:)/i.test(href);
}

function renderInline(text: string, ctx: Ctx, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  const pushText = (s: string) => {
    if (!s) return;
    const prev = out[out.length - 1];
    if (typeof prev === "string") out[out.length - 1] = prev + s;
    else out.push(s);
  };
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    pushText(text.slice(last, at));
    last = at + m[0].length;
    const key = `${keyBase}.${n++}`;
    if (m[1]) {
      out.push(<code key={key}>{m[2]}</code>);
    } else if (m[3]) {
      const num = ctx.citeNumber.get(m[4]);
      if (num === undefined) pushText(m[0]); // the validator reports it
      else
        out.push(
          <sup key={key} className="cite">
            <a href={`#source-${m[4]}`} aria-label={`Source ${num}`}>
              [{num}]
            </a>
          </sup>
        );
    } else if (m[5]) {
      const href = m[7];
      const label = renderInline(m[6], ctx, key);
      if (!isSafeHref(href)) out.push(...label);
      else if (/^https?:\/\//i.test(href))
        out.push(
          <a key={key} href={href} target="_blank" rel="noopener noreferrer">
            {label}
          </a>
        );
      else
        out.push(
          <a key={key} href={href}>
            {label}
          </a>
        );
    } else if (m[8]) {
      out.push(<strong key={key}>{renderInline(m[9], ctx, key)}</strong>);
    } else if (m[10]) {
      out.push(<em key={key}>{renderInline(m[11], ctx, key)}</em>);
    }
  }
  pushText(text.slice(last));
  return out;
}

/** Text with Markdown markers removed, for ids, TOC labels and word counts. */
export function plainText(text: string): string {
  return text
    .replace(/\[\^[a-z0-9-]+\]/g, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*`]/g, "")
    .trim();
}

function slugify(text: string): string {
  return (
    plainText(text)
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "section"
  );
}

function uniqueId(base: string, used: Set<string>): string {
  let id = base;
  for (let k = 2; used.has(id); k++) id = `${base}-${k}`;
  used.add(id);
  return id;
}

// ── Render ────────────────────────────────────────────────────────────

function renderBlocks(blocks: Block[], ctx: Ctx, keyBase: string): ReactNode[] {
  return blocks.map((b, idx) => {
    const key = `${keyBase}${idx}`;
    switch (b.kind) {
      case "heading": {
        const id = uniqueId(slugify(b.text), ctx.headingIds);
        const kids = renderInline(b.text, ctx, key);
        if (b.level === 2) return <h2 key={key} id={id}>{kids}</h2>;
        if (b.level === 3) return <h3 key={key} id={id}>{kids}</h3>;
        return <h4 key={key} id={id}>{kids}</h4>;
      }
      case "paragraph":
        return <p key={key}>{renderInline(b.text, ctx, key)}</p>;
      case "ul":
        return (
          <ul key={key}>
            {b.items.map((it, j) => (
              <li key={j}>{renderInline(it, ctx, `${key}.${j}`)}</li>
            ))}
          </ul>
        );
      case "ol":
        return (
          <ol key={key} start={b.start !== 1 ? b.start : undefined}>
            {b.items.map((it, j) => (
              <li key={j}>{renderInline(it, ctx, `${key}.${j}`)}</li>
            ))}
          </ol>
        );
      case "quote":
        return <blockquote key={key}>{renderBlocks(b.blocks, ctx, `${key}.`)}</blockquote>;
      case "callout":
        return (
          <aside key={key} className={`callout callout-${b.type.toLowerCase()}`} role="note">
            <p className="callout-title">{b.title ?? CALLOUT_LABEL[b.type]}</p>
            {renderBlocks(b.blocks, ctx, `${key}.`)}
          </aside>
        );
      case "table":
        return (
          <div key={key} className="table-scroll" role="region" aria-label="Table" tabIndex={0}>
            <table>
              <thead>
                <tr>
                  {b.head.map((h, j) => (
                    <th key={j} scope="col" style={b.align[j] ? { textAlign: b.align[j]! } : undefined}>
                      {renderInline(h, ctx, `${key}.h${j}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((row, r) => (
                  <tr key={r}>
                    {b.head.map((_, j) => (
                      <td key={j} style={b.align[j] ? { textAlign: b.align[j]! } : undefined}>
                        {renderInline(row[j] ?? "", ctx, `${key}.${r}.${j}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case "code":
        return (
          <pre key={key}>
            <code className={b.lang ? `language-${b.lang}` : undefined}>{b.code}</code>
          </pre>
        );
      case "figure": {
        if (!isSafeHref(b.src) || b.src.startsWith("#") || b.src.startsWith("mailto:")) return null;
        return (
          <figure key={key}>
            <Image
              src={b.src}
              alt={b.alt}
              width={1600}
              height={900}
              sizes="(max-width: 768px) 100vw, 720px"
              style={{ width: "100%", height: "auto" }}
            />
            {(b.caption || b.credit) && (
              <figcaption>
                {b.caption && <span>{renderInline(b.caption, ctx, `${key}.c`)}</span>}
                {b.credit && <span className="credit">{b.credit}</span>}
              </figcaption>
            )}
          </figure>
        );
      }
      case "hr":
        return <hr key={key} />;
    }
  });
}

export function renderMarkdown(body: string, options: RenderOptions = {}): ReactNode {
  const ctx: Ctx = {
    citeNumber: new Map((options.sourceIds ?? []).map((id, i) => [id, i + 1])),
    headingIds: new Set(),
  };
  return renderBlocks(parseBlocks(body), ctx, "b");
}

// ── Helpers the validator, TOC and reading time use ───────────────────

export function extractHeadings(body: string): Heading[] {
  const used = new Set<string>();
  const out: Heading[] = [];
  const walk = (blocks: Block[]) => {
    for (const b of blocks) {
      if (b.kind === "heading") out.push({ id: uniqueId(slugify(b.text), used), text: plainText(b.text), level: b.level });
      if (b.kind === "quote" || b.kind === "callout") walk(b.blocks);
    }
  };
  walk(parseBlocks(body));
  return out;
}

export function extractCitationIds(body: string): string[] {
  return [...new Set([...body.matchAll(/\[\^([a-z0-9][a-z0-9-]*)\]/g)].map((m) => m[1]))];
}

export function extractFigures(body: string): { alt: string; src: string; credit: string | null }[] {
  const out: { alt: string; src: string; credit: string | null }[] = [];
  const walk = (blocks: Block[]) => {
    for (const b of blocks) {
      if (b.kind === "figure") out.push({ alt: b.alt, src: b.src, credit: b.credit });
      if (b.kind === "quote" || b.kind === "callout") walk(b.blocks);
    }
  };
  walk(parseBlocks(body));
  return out;
}

export function countWords(body: string): number {
  return plainText(body.replace(/```[\s\S]*?```/g, " ").replace(/^[#>|\-*\d.)\s]+/gm, " "))
    .split(/\s+/)
    .filter(Boolean).length;
}
