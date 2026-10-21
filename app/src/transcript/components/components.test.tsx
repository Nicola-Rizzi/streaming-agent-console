// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { f } from "../../test/transcript";
import { initialState, transcriptReducer } from "../reducer";
import { selectTranscript } from "../selectors";
import { Transcript } from "../Transcript";
import type { Block, Snapshot, TranscriptAction } from "../types";
import { Artifact } from "./Artifact";
import { Blocks } from "./Blocks";
import { stabilize } from "./stabilize";

beforeAll(() => {
  // jsdom has no layout; the scroll hook only needs the observer to exist.
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
});
afterEach(cleanup);

function snapshotOf(...actions: TranscriptAction[]): Snapshot {
  return { state: actions.reduce(transcriptReducer, initialState), load: "ready", connection: "idle" };
}

function renderTranscript(snapshot: Snapshot, onResume = vi.fn(), onAnswer = vi.fn()) {
  render(
    <Transcript onAnswer={onAnswer} onResume={onResume} snapshot={snapshot} view={selectTranscript(snapshot.state)} />,
  );
  return onResume;
}

describe("UC-3 thread states are distinct", () => {
  it("shows a skeleton while loading", () => {
    renderTranscript({ state: initialState, load: "loading", connection: "streaming" });
    expect(screen.getByRole("status", { name: "Loading thread" })).toBeTruthy();
  });

  it("explains a failed load and offers to try again", () => {
    const onResume = renderTranscript({ state: initialState, load: "failed", connection: "idle" });
    expect(screen.getByText("Couldn't load this thread")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onResume).toHaveBeenCalledOnce();
  });

  it("invites a first message in an empty thread", () => {
    renderTranscript(snapshotOf({ type: "frames", frames: [f("final", { type: "bookmark" })] }));
    expect(screen.getByText("No messages yet")).toBeTruthy();
  });
});

describe("UC-11 partial markdown", () => {
  it("holds back an opening ** or ` until its partner arrives", () => {
    expect(stabilize("Spend is **up")).toBe("Spend is up");
    expect(stabilize("Run `npm")).toBe("Run npm");
    expect(stabilize("**done** and `ok`")).toBe("**done** and `ok`");
  });

  it("leaves text inside an unclosed code fence alone", () => {
    expect(stabilize("```sql\nSELECT `a` **")).toBe("```sql\nSELECT `a` **");
  });
});

describe("UC-19 / UC-22 artifacts", () => {
  it("says plainly when an artifact is missing or of an unknown type", () => {
    render(<Artifact id="art-missing" />);
    render(<Artifact artifact={{ id: "g", type: "geo_heatmap" } as never} id="g" />);
    expect(screen.getByText(/isn't available \(art-missing\)/)).toBeTruthy();
    expect(screen.getByText(/can't be shown here yet \(geo_heatmap\)/)).toBeTruthy();
  });
});

describe("UC-38 a block that breaks while rendering breaks only itself", () => {
  it("keeps the rest of the turn on screen, and reports the error", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = { kind: "group", key: "g", items: undefined } as unknown as Block;
    render(<Blocks blocks={[{ kind: "assistant", key: "a", text: "Still here", streaming: false }, broken]} />);
    expect(screen.getByText("Still here")).toBeTruthy();
    expect(screen.getByText("This part of the answer couldn't be displayed.")).toBeTruthy();
    expect(error).toHaveBeenCalledWith("[block render]", expect.any(TypeError), expect.any(String));
    error.mockRestore();
  });
});

describe("hierarchy and turn outcomes", () => {
  const sent: TranscriptAction = { type: "sent", text: "Pull the report" };
  const running = f("final", {
    type: "action",
    id: "job",
    title: "Build attribution report",
    icon: "x",
    has_succeeded: null,
  });

  it("UC-27 an interrupted turn says what happened and offers Resume", () => {
    const onResume = renderTranscript(
      snapshotOf(sent, { type: "frames", frames: [running] }, { type: "ended", reason: "dropped" }),
    );
    expect(screen.getByText("The connection dropped")).toBeTruthy();
    expect(screen.getByText("Didn't finish: the turn ended while it was running")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(onResume).toHaveBeenCalledOnce();
  });

  it("UC-24 a stopped turn keeps its content without alarm", () => {
    renderTranscript(
      snapshotOf(
        sent,
        { type: "frames", frames: [f("streaming", { type: "assistant", id: "a", content: "Partial answer" })] },
        { type: "ended", reason: "stopped" },
      ),
    );
    expect(screen.getByText("Partial answer")).toBeTruthy();
    expect(screen.getByText("■ Stopped. Everything that arrived is kept.")).toBeTruthy();
  });

  it("UC-26 a failed turn reads as failed, with the error in place", () => {
    renderTranscript(
      snapshotOf(
        sent,
        { type: "frames", frames: [f("error", { title: "Baseline job crashed", status: 500 })] },
        { type: "ended", reason: "closed" },
      ),
    );
    expect(screen.getByText("Baseline job crashed")).toBeTruthy();
    expect(screen.getByText(/This turn failed/)).toBeTruthy();
  });
});

describe("UC-31 to UC-34 questions from the assistant", () => {
  const october = {
    type: "command",
    command: "ask-user-question",
    id: "q-october",
    questions: [
      {
        id: "budget_shape",
        header: "October budget",
        question: "How should October's LinkedIn budget be set?",
        multi_select: false,
        options: [{ label: "Cap at September" }, { label: "Cut 20%" }],
      },
      {
        id: "channels",
        header: "Also review",
        question: "Which other channels should I look at?",
        multi_select: true,
        options: [{ label: "Google Ads" }, { label: "Meta" }, { label: "Email" }],
      },
      {
        id: "cadence",
        header: "Reporting",
        question: "How often do you want the follow-up?",
        multi_select: false,
        options: [{ label: "Weekly" }],
      },
    ],
  };
  const asked = () =>
    snapshotOf(
      { type: "sent", text: "Plan October" },
      { type: "frames", frames: [f("final", october), f("complete", {})] },
    );

  it("answers single and multi select, free text and blanks, all in one turn", () => {
    const onAnswer = vi.fn();
    renderTranscript(asked(), vi.fn(), onAnswer);
    fireEvent.click(screen.getByLabelText("Cap at September"));
    fireEvent.click(screen.getByLabelText("Google Ads"));
    fireEvent.click(screen.getByLabelText("Meta"));
    fireEvent.change(screen.getByLabelText("Other answer to: Which other channels should I look at?"), {
      target: { value: "TikTok" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send answers" }));
    expect(onAnswer).toHaveBeenCalledOnce();
    expect(onAnswer).toHaveBeenCalledWith(
      "October budget: Cap at September\nAlso review: Google Ads, Meta, TikTok\nReporting: no answer",
    );
  });
});

describe("the composer lock", () => {
  it("is locked exactly when there is a reason, and says which", async () => {
    const { composerState } = await import("../../components/composerState");
    const ready = snapshotOf({ type: "frames", frames: [f("final", { type: "bookmark" })] });
    const reason = (snapshot: Snapshot) => composerState(snapshot, selectTranscript(snapshot.state)).lockedReason;
    expect(reason({ ...ready, load: "loading" })).toBe("Loading the conversation…");
    expect(reason({ ...ready, connection: "reconnecting" })).toBe("Reconnecting…");
    const asked = snapshotOf(
      { type: "sent", text: "Plan" },
      {
        type: "frames",
        frames: [
          f("final", { type: "command", command: "ask-user-question", id: "q", questions: [] }),
          f("complete", {}),
        ],
      },
    );
    expect(reason(asked)).toBe("Answer the question above to continue");
    expect(reason(ready)).toBeUndefined();
    const running = snapshotOf({ type: "sent", text: "Go" });
    expect(composerState(running, selectTranscript(running.state))).toEqual({
      turnRunning: true,
      lockedReason: undefined,
    });
  });
});
