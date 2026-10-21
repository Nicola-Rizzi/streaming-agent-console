import { describe, expect, it } from "vitest";

import { f, frames, reduceAll } from "../test/transcript";
import { initialState } from "./reducer";
import { createViewSelector } from "./stableView";

const text = (id: string, content: string) => f("streaming", { type: "assistant", id, content });

describe("createViewSelector", () => {
  it("keeps settled turns as the same objects while the last one streams", () => {
    const select = createViewSelector();
    let state = reduceAll(initialState, { type: "sent", text: "q1" }, frames([text("a1", "first"), f("complete", {})]));
    state = reduceAll(state, { type: "sent", text: "q2" }, frames([text("a2", "sec")]));
    const before = select(state);
    const after = select(reduceAll(state, frames([text("a2", "ond")])));

    expect(after.turns[0]).toBe(before.turns[0]);
    expect(after.turns[1]).not.toBe(before.turns[1]);
    expect(after.turns[1].blocks[0]).toMatchObject({ text: "second" });
  });

  it("keeps a settled action and the user message as the same objects inside the streaming turn", () => {
    const select = createViewSelector();
    const action = f("final", {
      type: "action",
      id: "s1",
      title: "Query spend",
      icon: "x",
      kind: "tool",
      has_succeeded: true,
    });
    const state = reduceAll(initialState, { type: "sent", text: "q" }, frames([action, text("a1", "sec")]));
    const before = select(state);
    const after = select(reduceAll(state, frames([text("a1", "ond")])));

    expect(after.turns[0].user).toBe(before.turns[0].user);
    expect(after.turns[0].blocks[0]).toBe(before.turns[0].blocks[0]);
    expect(after.turns[0].blocks[1]).not.toBe(before.turns[0].blocks[1]);
  });
});
