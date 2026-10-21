import { describe, expect, it } from "vitest";

import { loadFixture } from "../test/fixtures";
import { outline } from "../test/outline";
import { seeded } from "../test/random";
import { liveTurn, resumeStream } from "../test/streams";
import { f, frames, reduceAll } from "../test/transcript";
import { initialState } from "./reducer";
import { selectTranscript } from "./selectors";

/**
 * Expected trees written by hand, independently of the reducer: a small worked
 * example, and two recorded threads read frame by frame.
 * The replay harness checks rules; these check that the rules add up to the right answer.
 */

describe("a small worked example", () => {
  const action = (id: string, title: string, extra: object = {}) => ({
    type: "action",
    id,
    title,
    icon: "x",
    kind: "tool",
    has_succeeded: true,
    ...extra,
  });

  const stream = [
    f("final", { type: "user", id: "u1", content: "How did Q3 do?", timestamp: "" }),
    f("final", { type: "thinking", id: "t1", content: "Pull spend, then benchmarks." }),
    f("final", action("act-spend", "Query campaign spend")),
    f("final", action("act-bench", "Fetch benchmarks")),
    f("final|aud", { type: "thinking", id: "s-t1", content: "Check segment overlap." }),
    f("final|aud", action("s-act", "Compute overlap")),
    f("final", action("act-agent", "Audience specialist", { kind: "agent", scope_id: "aud" })),
    f("final", { type: "artifact", artifact_id: "art-trend" }),
    f("streaming", { type: "assistant", id: "a1", content: "Blended ROAS of 3.1 " }),
    f("streaming", { type: "assistant", id: "a1", content: "across three channels..." }),
    f("final", { type: "assistant", id: "a1", content: "Blended ROAS of 3.1 across three channels..." }),
    f("complete", {}),
  ];

  it("reduces to the expected tree", () => {
    const state = reduceAll(initialState, { type: "sent", text: "How did Q3 do?" }, frames(stream.slice(1)));
    expect(outline(selectTranscript(state))).toEqual([
      "turn [completed] user: How did Q3 do?",
      "  thinking: Pull spend, then benchmarks.",
      "  group",
      "    action [succeeded] Query campaign spend",
      "    action [succeeded] Fetch benchmarks",
      "    action [succeeded] Audience specialist",
      "      thinking: Check segment overlap.",
      "      group",
      "        action [succeeded] Compute overlap",
      "  artifact art-trend (missing)",
      "  assistant: Blended ROAS of 3.1 …",
    ]);
  });
});

describe("campaign-review, reopened after every turn settled", () => {
  it("matches the hand-written tree", () => {
    const state = reduceAll(initialState, frames(resumeStream(loadFixture("campaign-review.sse"))));
    expect(outline(selectTranscript(state))).toEqual([
      "turn [completed] user: How did the Q3 …",
      "  assistant: Overall Q3 launch spend …",
      "turn [completed] user: turn 1",
      "  thinking: The user wants the …",
      "  group",
      "    action [succeeded] Query campaign spend",
      "    action [succeeded] Audience specialist",
      "      thinking: Checking audience overlap between …",
      "      group",
      "        action [succeeded] Compute segment overlap",
      "  artifact art-trend (chart)",
      "  assistant: Here's the picture: - …",
      "  question q1",
      "turn [completed] user: turn 2",
      "  thinking: They picked an option. …",
      "  group",
      "    action [succeeded] Draft report",
      "  assistant: Done — `q3-next-steps.md` is …",
      "turn [completed] user: turn 3",
      "  thinking: Before I touch October …",
      "  question q-october",
      "turn [completed] user: turn 4",
      "  thinking: They answered all three. …",
      "  group",
      "    action [succeeded] Draft October plan",
      "  assistant: October is capped at …",
    ]);
  });
});

describe("error-recovery, sent live turn by turn", () => {
  it("shows an error that the turn survives, then one that ends it", () => {
    const fixture = loadFixture("error-recovery.sse");
    const random = seeded(7);
    let state = reduceAll(initialState, frames(resumeStream({ ...fixture, turns: [] })));
    // Turn 1: the error is content, and the server completes the turn.
    state = reduceAll(
      state,
      { type: "sent", text: "Compare our CPCs" },
      frames(liveTurn(fixture, fixture.turns[0], random)),
    );
    // Turn 2: the last frame is an error and the stream closes without `complete`.
    state = reduceAll(
      state,
      { type: "sent", text: "Use our own history" },
      frames(liveTurn(fixture, fixture.turns[1], random)),
      {
        type: "ended",
        reason: "closed",
      },
    );

    expect(outline(selectTranscript(state))).toEqual([
      "turn [completed] user: Compare our CPCs against …",
      "turn [completed] user: Compare our CPCs",
      "  group",
      "    action [failed] Fetch industry benchmarks",
      "  problem: Benchmark provider unavailable",
      "  assistant: The external benchmark service …",
      "turn [failed] user: Use our own history",
      "  thinking: They want the same …",
      "  group",
      "    action [interrupted] Recompute CPC baselines",
      "  problem: Baseline job crashed",
    ]);
  });
});
