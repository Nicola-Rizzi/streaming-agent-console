import { describe, expect, it } from "vitest";

import type { FixtureItem } from "./fixtures";
import { planV2 } from "./playback";

const halfway = () => 0.5;

function actionFrame(
  event: string,
  message: Record<string, unknown>,
): FixtureItem {
  return { frame: { data: JSON.stringify({ id: "action-1", type: "action", ...message }), event }, kind: "frame" };
}

describe("v2 action pacing", () => {
  it("waits for the recorded duration between running and settled frames", () => {
    const plan = planV2(
      [
        actionFrame("final", { started_at: "2026-08-01T09:00:00.000Z" }),
        actionFrame("final", { ended_at: "2026-08-01T09:00:05.200Z", has_succeeded: true }),
      ],
      halfway,
    );

    expect(plan).toHaveLength(2);
    expect(plan[0]?.waitMs).toBe(120);
    expect(plan[1]?.waitMs).toBe(5200);
  });

  it("tracks repeated ids independently in different scopes", () => {
    const plan = planV2(
      [
        actionFrame("final|first", { has_succeeded: true }),
        actionFrame("final|second", { has_succeeded: true }),
      ],
      halfway,
    );

    expect(plan).toHaveLength(4);
    expect(
      plan.filter((step) => step.event?.kind === "frame" && step.event.frame.event.startsWith("streaming")),
    ).toHaveLength(2);
  });

  it("does not add the full duration of actions that ran concurrently", () => {
    const plan = planV2(
      [
        actionFrame("final", { id: "first", started_at: "2026-08-01T09:00:00.000Z" }),
        actionFrame("final", { id: "second", started_at: "2026-08-01T09:00:00.000Z" }),
        actionFrame("final", { ended_at: "2026-08-01T09:00:05.000Z", has_succeeded: true, id: "first" }),
        actionFrame("final", { ended_at: "2026-08-01T09:00:05.000Z", has_succeeded: true, id: "second" }),
      ],
      halfway,
    );

    expect(plan.reduce((total, step) => total + (step.waitMs ?? 0), 0)).toBe(5240);
  });

  it("treats a later settled copy as an update, not another execution", () => {
    const plan = planV2(
      [
        actionFrame("final", { has_succeeded: true }),
        actionFrame("final", { has_succeeded: true, title: "Updated result" }),
      ],
      halfway,
    );

    expect(plan).toHaveLength(3);
    expect(plan[2]?.waitMs).toBe(120);
  });
});
