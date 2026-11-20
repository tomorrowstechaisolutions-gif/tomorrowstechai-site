import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { cacheMarked } from "../cache";
import { costMicroUsd, TESS_MODEL } from "../models";

type Msg = Anthropic.MessageParam;
const MARK = { type: "ephemeral" };
const marks = (messages: Msg[]) => JSON.stringify(messages).split('"cache_control"').length - 1;

describe("marking the conversation so the model reads it at the cached price", () => {
  it("marks the end of the last message, turning plain text into a block", () => {
    const sent = cacheMarked([{ role: "user", content: "Open the leads page" }]);
    expect(sent[0].content).toEqual([{ type: "text", text: "Open the leads page", cache_control: MARK }]);
  });

  it("marks the last block when the message is a list, such as tool results", () => {
    const messages: Msg[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: [{ type: "tool_use", id: "tu-1", name: "find_lead", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "tu-1", content: "a" }, { type: "tool_result", tool_use_id: "tu-2", content: "b" }] },
    ];
    const sent = cacheMarked(messages);
    const last = sent[2].content as unknown as Record<string, unknown>[];
    expect(last[0].cache_control).toBeUndefined();
    expect(last[1].cache_control).toEqual(MARK);
    expect(marks(sent)).toBe(1);
  });

  it("never changes the conversation it was given, so the saved one stays unmarked", () => {
    const messages: Msg[] = [{ role: "user", content: [{ type: "text", text: "hello" }] }];
    const before = JSON.stringify(messages);
    const sent = cacheMarked(messages);
    expect(JSON.stringify(messages)).toBe(before);
    expect(sent).not.toBe(messages);
    expect(marks(sent)).toBe(1);
  });

  it("leaves earlier messages exactly as they are", () => {
    const messages: Msg[] = [{ role: "user", content: "one" }, { role: "assistant", content: [{ type: "text", text: "two" }] }, { role: "user", content: "three" }];
    const sent = cacheMarked(messages);
    expect(sent[0]).toBe(messages[0]);
    expect(sent[1]).toBe(messages[1]);
  });

  it("sends an empty message unmarked, because the service refuses a mark on empty text", () => {
    expect(cacheMarked([{ role: "user", content: "  " }])).toEqual([{ role: "user", content: "  " }]);
    expect(cacheMarked([{ role: "user", content: [{ type: "text", text: "" }] }])[0].content).toEqual([{ type: "text", text: "" }]);
    expect(cacheMarked([])).toEqual([]);
  });
});

describe("what a cached conversation costs", () => {
  it("is a fraction of reading the same conversation at full price", () => {
    const full = costMicroUsd(TESS_MODEL, { input_tokens: 20_000, output_tokens: 0 });
    const cached = costMicroUsd(TESS_MODEL, { input_tokens: 0, cache_read_input_tokens: 19_500, cache_creation_input_tokens: 500, output_tokens: 0 });
    expect(cached).toBeLessThan(full / 10);
  });
});
