import { describe, expect, it } from "vitest";

import { decodeFrame } from "./decode";

describe("decodeFrame", () => {
  it("treats a keep-alive (the empty frame the transport emits for comments) as no content", () => {
    expect(decodeFrame({ event: "", data: "" })).toEqual([{ kind: "ignored" }]);
  });

  it("splits the scope suffix off the channel", () => {
    const [decoded] = decodeFrame({ event: "final|aud-1", data: '{"type":"thinking","id":"t1","content":"x"}' });
    expect(decoded).toMatchObject({ kind: "message", channel: "final", scope: "aud-1" });
  });

  it("expands an array payload into one event per message", () => {
    const data = '[{"type":"assistant","id":"a1","content":"x"},{"type":"assistant","id":"a2","content":"y"}]';
    expect(decodeFrame({ event: "final", data })).toHaveLength(2);
  });

  it("turns malformed JSON into a local placeholder instead of throwing", () => {
    expect(decodeFrame({ event: "final|s", data: "{not json" })).toEqual([{ kind: "malformed", scope: "s" }]);
  });

  it("keeps unknown message types, ignores unknown channels", () => {
    expect(decodeFrame({ event: "final", data: '{"type":"signal_check","id":"x1"}' })[0]).toMatchObject({
      kind: "message",
      message: { type: "signal_check" },
    });
    expect(decodeFrame({ event: "telemetry", data: "{}" })).toEqual([{ kind: "ignored" }]);
  });

  it("fills in problem details the wire left out", () => {
    expect(decodeFrame({ event: "error", data: "{}" })).toEqual([
      { kind: "problem", scope: "", problem: { title: "Something went wrong", status: undefined, detail: undefined } },
    ]);
  });
});
