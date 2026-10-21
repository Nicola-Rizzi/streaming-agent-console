import { describe, expect, it } from "vitest";

import { actionDelayMs, initialTextDelayMs, textChunkDelayMs } from "./pacing";

const halfway = () => 0.5;

describe("actionDelayMs", () => {
  it("uses a recorded duration when it is within the tool limits", () => {
    const running = { kind: "tool", started_at: "2026-08-01T09:00:00.000Z" };
    const settled = { ended_at: "2026-08-01T09:00:05.200Z" };

    expect(actionDelayMs(settled, running, halfway)).toBe(5200);
  });

  it("caps long recorded work according to its action kind", () => {
    const started_at = "2026-08-01T09:00:00.000Z";

    expect(actionDelayMs({ ended_at: "2026-08-01T09:00:48.000Z", kind: "agent", started_at }, undefined, halfway)).toBe(
      18000,
    );
    expect(
      actionDelayMs({ ended_at: "2026-08-01T09:02:05.000Z", kind: "library", started_at }, undefined, halfway),
    ).toBe(8000);
  });

  it("uses slower fallbacks for broader work", () => {
    expect(actionDelayMs({ kind: "tool" }, undefined, halfway)).toBe(5000);
    expect(actionDelayMs({ kind: "library" }, undefined, halfway)).toBe(3500);
    expect(actionDelayMs({ kind: "agent" }, undefined, halfway)).toBe(12000);
  });
});

describe("text pacing", () => {
  it("waits longer for thinking to begin", () => {
    expect(initialTextDelayMs("thinking", halfway)).toBeGreaterThan(initialTextDelayMs("assistant", halfway));
  });

  it("pauses after punctuation", () => {
    expect(textChunkDelayMs("assistant", "Done. ", halfway)).toBeGreaterThan(
      textChunkDelayMs("assistant", "still going ", halfway),
    );
  });
});
