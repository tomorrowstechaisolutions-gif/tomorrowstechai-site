import type Anthropic from "@anthropic-ai/sdk";

/**
 * The conversation as it is sent to the model, with a cache mark on the end
 * of the last message.
 *
 * Every call sends the whole conversation again. Without a mark, all of it is
 * read at the full input price each time, so a long talk costs more with every
 * reply. With the mark, the service keeps what it has read for a few minutes:
 * the next call pays the full price only for what is new and about a
 * twentieth of it for the rest.
 *
 * The mark is put on a copy. The saved conversation is never marked: it is
 * append-only, and a mark left behind on every turn would pile up past the
 * four the service allows. The mark does not count as a change to the
 * conversation, so the model's earlier reasoning still reads back.
 */
export function cacheMarked(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  const last = messages[messages.length - 1];
  if (!last) return messages;
  const mark = { cache_control: { type: "ephemeral" as const } };

  if (typeof last.content === "string") {
    // The service refuses a mark on empty text.
    if (!last.content.trim()) return messages;
    return [...messages.slice(0, -1), { ...last, content: [{ type: "text", text: last.content, ...mark }] }];
  }

  const blocks = last.content;
  const end = blocks[blocks.length - 1];
  if (!end) return messages;
  if (end.type === "text" && !end.text.trim()) return messages;
  // Reasoning blocks cannot carry a mark. They only end a model reply, which is never the last thing sent.
  if (end.type === "thinking" || end.type === "redacted_thinking") return messages;
  const marked = { ...end, ...mark } as Anthropic.ContentBlockParam;
  return [...messages.slice(0, -1), { ...last, content: [...blocks.slice(0, -1), marked] }];
}
