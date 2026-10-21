import { describe, expect, it } from "vitest";

import type { StreamFrame } from "../api/types";
import { f } from "../test/transcript";
import { initialState, transcriptReducer } from "./reducer";
import { selectTranscript } from "./selectors";
import type { ActionView, Block, TranscriptAction, TranscriptState } from "./types";

const user = (id: string) => f("final", { type: "user", id, content: "How did Q3 do?", timestamp: "" });
const text = (channel: string, id: string, content: string, type = "assistant") => f(channel, { type, id, content });
const action = (id: string, extra: object = {}, channel = "final") =>
  f(channel, { type: "action", id, title: id, icon: "x", kind: "tool", has_succeeded: true, ...extra });

function run(...steps: (StreamFrame[] | TranscriptAction)[]): TranscriptState {
  return steps.reduce<TranscriptState>(
    (state, step) => transcriptReducer(state, Array.isArray(step) ? { type: "frames", frames: step } : step),
    initialState,
  );
}

const view = (state: TranscriptState) => selectTranscript(state);
const blocks = (state: TranscriptState, turn = 0) => view(state).turns[turn].blocks;
const group = (b: Block) => (b.kind === "group" ? b.items : []);

describe("supersession", () => {
  it("accumulates streaming deltas into one message", () => {
    const state = run([user("u1"), text("streaming", "a1", "Blended "), text("streaming", "a1", "ROAS")]);
    expect(blocks(state)).toEqual([{ kind: "assistant", key: ":a1", text: "Blended ROAS", streaming: false }]);
  });

  it("lets a final replace the deltas, and a later final replace the earlier one", () => {
    const state = run(
      { type: "sent", text: "hi" },
      [text("streaming", "a1", "draft that differs")],
      [text("final", "a1", "first final")],
      [text("final", "a1", "second final")],
    );
    expect(blocks(state)[0]).toMatchObject({ text: "second final", streaming: false });
  });
});

describe("grouping", () => {
  it("groups consecutive actions and closes the group on assistant text or an artifact", () => {
    const state = run([
      user("u1"),
      action("a"),
      action("b"),
      text("final", "x", "between"),
      action("c"),
      f("final", { type: "artifact", artifact_id: "missing" }),
      action("d"),
    ]);
    expect(blocks(state).map((b) => b.kind)).toEqual(["group", "assistant", "group", "artifact", "group"]);
  });

  it("keeps thinking that arrives between actions inside the group, but not thinking before the first action", () => {
    const state = run([
      user("u1"),
      text("final", "t1", "before", "thinking"),
      action("a"),
      text("final", "t2", "between", "thinking"),
      action("b"),
    ]);
    const [lead, g] = blocks(state);
    expect(lead.kind).toBe("thinking");
    expect(group(g).map((i) => i.key)).toEqual([":a", ":t2", ":b"]);
  });
});

describe("sub-agent scopes", () => {
  it("nests scoped frames inside the agent action even when they arrive first", () => {
    const state = run([
      text("final|aud", "s-t1", "checking overlap", "thinking"),
      action("agent-1", { kind: "agent", scope_id: "aud" }),
    ]);
    const [agent] = group(blocks(state)[0]) as ActionView[];
    expect(agent.children).toMatchObject([{ kind: "thinking", text: "checking overlap" }]);
    expect(blocks(state)).toHaveLength(1);
  });

  it("nests at arbitrary depth and keys ids per scope", () => {
    const state = run([
      user("u1"),
      action("same", {}, "final|inner"),
      action("same", { kind: "agent", scope_id: "inner" }, "final|outer"),
      action("same", { kind: "agent", scope_id: "outer" }),
    ]);
    const [outer] = group(blocks(state)[0]) as ActionView[];
    const [inner] = group(outer.children[0]) as ActionView[];
    const [leaf] = group(inner.children[0]) as ActionView[];
    expect([outer.key, inner.key, leaf.key]).toEqual([":same", "outer:same", "inner:same"]);
  });
});

describe("turn lifecycle", () => {
  const sent: TranscriptAction = { type: "sent", text: "Pull the report" };

  it("completes on complete, keeping the user's message the stream never echoes", () => {
    const state = run(sent, [text("final", "a1", "ok"), f("complete", {})]);
    expect(view(state).turns[0]).toMatchObject({ user: { content: "Pull the report" }, status: "completed" });
  });

  it("treats an error as content: the turn carries on", () => {
    const state = run(sent, [f("error", { title: "Rate limited" }), text("final", "a1", "recovered")]);
    expect(view(state).turns[0].status).toBe("streaming");
    expect(blocks(state).map((b) => b.kind)).toEqual(["problem", "assistant"]);
  });

  it("is interrupted, not failed, when the connection drops", () => {
    const state = run(sent, [action("job", { has_succeeded: null })], { type: "ended", reason: "dropped" });
    expect(view(state).turns[0].status).toBe("interrupted");
    expect(group(blocks(state)[0])[0]).toMatchObject({ status: "interrupted" });
  });

  it("keeps what arrived when the user stops, and marks running work stopped", () => {
    const state = run(sent, [text("streaming", "a1", "Half an ans"), action("job", { has_succeeded: null })], {
      type: "ended",
      reason: "stopped",
    });
    expect(view(state).turns[0].status).toBe("stopped");
    expect(blocks(state)[0]).toMatchObject({ kind: "assistant", text: "Half an ans" });
    expect(group(blocks(state)[1])[0]).toMatchObject({ status: "stopped" });
  });

  it("fails when the stream closes right after an error, leaving the running action interrupted", () => {
    const state = run(sent, [action("job", { has_succeeded: null }), f("error", { title: "Crashed" })], {
      type: "ended",
      reason: "closed",
    });
    expect(view(state).turns[0].status).toBe("failed");
    expect(group(blocks(state)[0])[0]).toMatchObject({ status: "interrupted" });
  });
});

describe("history and resume", () => {
  it("marks turns before the bookmark as history and derives their outcome", () => {
    const state = run([
      user("u1"),
      action("job", { has_succeeded: null }),
      f("error", { title: "Crashed" }),
      user("u2"),
      text("final", "a2", "fine"),
      f("final", { type: "bookmark" }),
      f("complete", {}),
    ]);
    expect(view(state).turns.map((t) => [t.history, t.status])).toEqual([
      [true, "failed"],
      [true, "completed"],
    ]);
  });

  it("joins a turn in flight when content follows the bookmark, and treats it as live, not history", () => {
    const state = run([user("u1"), f("final", { type: "bookmark" }), text("streaming", "a1", "still going")]);
    expect(view(state).turns[0]).toMatchObject({ status: "streaming", history: false, blocks: [{ streaming: true }] });
  });
});

describe("unknown content", () => {
  it("degrades unknown types and malformed frames in place, keeping the rest", () => {
    const state = run([
      text("final", "a1", "before"),
      f("final", { type: "signal_check", id: "sc" }),
      { event: "final", data: "{not json" },
      text("final", "a2", "after"),
    ]);
    expect(blocks(state).map((b) => (b.kind === "unknown" ? `unknown:${b.type}` : b.kind))).toEqual([
      "assistant",
      "unknown:signal_check",
      "unknown:malformed",
      "assistant",
    ]);
  });

  it("shows a command other than ask-user-question as unsupported", () => {
    const state = run([user("u1"), f("final", { type: "command", command: "open-dashboard", id: "c1" })]);
    expect(blocks(state)).toEqual([{ kind: "unknown", key: ":command:c1", type: "command:open-dashboard" }]);
  });

  it("shows a user message inside a sub-agent scope as unsupported, not as a new turn", () => {
    const state = run([
      user("u1"),
      f("final|s", { type: "user", id: "nested", content: "?", timestamp: "" }),
      action("agent", { kind: "agent", scope_id: "s" }),
    ]);
    expect(view(state).turns).toHaveLength(1);
    const [agent] = group(blocks(state)[0]) as ActionView[];
    expect(agent.children).toEqual([{ kind: "unknown", key: "s:nested", type: "user" }]);
  });

  it("surfaces the size limit from metadata", () => {
    const state = run([user("u1"), f("final", { type: "metadata", maximum_size_reached: true })]);
    expect(view(state).limitReached).toBe(true);
  });
});

describe("turns and artifacts across sends", () => {
  const sent = (text: string): TranscriptAction => ({ type: "sent", text });

  it("keeps a stopped turn stopped after the user sends the next message", () => {
    const state = run(
      sent("first"),
      [action("job", { has_succeeded: null })],
      { type: "ended", reason: "stopped" },
      sent("second"),
    );
    expect(view(state).turns[0].status).toBe("stopped");
    expect(group(view(state).turns[0].blocks[0])[0]).toMatchObject({ status: "stopped" });
  });

  it("shows an artifact referenced again in a later turn in both turns", () => {
    const chart = { id: "X", type: "chart", data: [], layout: {} };
    const ref = f("final", { type: "artifact", artifact_id: "X" });
    const state = run(sent("show it"), [action("a", { artifacts: [chart] }), ref, f("complete", {})], sent("again"), [
      ref,
    ]);
    expect(view(state).turns.map((t) => t.blocks.filter((b) => b.kind === "artifact").length)).toEqual([1, 1]);
  });

  it("keys turns by position, so a turn keeps its identity when a resume replays its first message under another id", () => {
    expect(view(run(sent("hi"))).turns[0].key).toBe("turn:0");
    expect(view(run([user("user-1"), f("final", { type: "bookmark" })])).turns[0].key).toBe("turn:0");
  });

  it("resolves a result's artifact_id to the artifact, wherever it was delivered", () => {
    const table = { id: "T1", type: "table", columns: { a: [1] } };
    const state = run(sent("x"), [
      action("producer", { artifacts: [table] }),
      action("pointer", { results: [{ title: "Table", artifact_id: "T1" }] }),
    ]);
    const [, pointer] = group(blocks(state)[0]) as ActionView[];
    expect(pointer.outputs).toEqual([{ id: "T1", artifact: table }]);
  });
});
