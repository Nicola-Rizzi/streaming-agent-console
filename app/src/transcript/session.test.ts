import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StreamFrame } from "../api/types";
import { bookmark, complete, f } from "../test/transcript";
import { selectTranscript } from "./selectors";
import { createTranscriptSession } from "./session";
import type { Transport } from "./types";

/**
 * A stream the test drives frame by frame. It rejects on abort, as `fetch` does,
 * unless it is `leaky`: then it keeps delivering, like a frame already in flight.
 */
class FakeStream implements AsyncIterable<StreamFrame> {
  private readonly queue: (StreamFrame | "end" | Error)[] = [];
  private wake: (() => void) | null = null;
  finished = false;

  constructor(
    readonly signal: AbortSignal,
    private readonly leaky = false,
  ) {
    signal.addEventListener("abort", () => this.wake?.());
  }

  push(...items: (StreamFrame | "end" | Error)[]) {
    this.queue.push(...items);
    this.wake?.();
  }

  async *[Symbol.asyncIterator]() {
    try {
      while (true) {
        if (this.signal.aborted && !this.leaky) throw new DOMException("aborted", "AbortError");
        const item = this.queue.shift();
        if (item === undefined) {
          await new Promise<void>((resolve) => (this.wake = resolve));
          continue;
        }
        if (item === "end") return;
        if (item instanceof Error) throw item;
        yield item;
      }
    } finally {
      this.finished = true;
    }
  }
}

function fakeTransport() {
  const options = { leaky: false };
  const streams: { kind: "resume" | "send"; stream: FakeStream }[] = [];
  const cancel = vi.fn(async () => {});
  const transport: Transport = {
    resume: (_id, signal) => {
      const stream = new FakeStream(signal, options.leaky);
      streams.push({ kind: "resume", stream });
      return stream;
    },
    send: (_id, _text, signal) => {
      const stream = new FakeStream(signal, options.leaky);
      streams.push({ kind: "send", stream });
      return stream;
    },
    cancel,
  };
  return {
    options,
    transport,
    cancel,
    streams,
    last: () => streams[streams.length - 1].stream,
    resumes: () => streams.filter((s) => s.kind === "resume").length,
    sends: () => streams.filter((s) => s.kind === "send").length,
    open: () => streams.filter((s) => !s.stream.signal.aborted && !s.stream.finished).length,
  };
}

const keepAlive: StreamFrame = { event: "", data: "" };
const history = [
  f("final", { type: "user", id: "u1", content: "Hi", timestamp: "" }),
  f("final", { type: "assistant", id: "a1", content: "Hello" }),
];
const text = (id: string, content: string, channel = "final") => f(channel, { type: "assistant", id, content });

const settle = () => vi.advanceTimersByTimeAsync(1);

/** By default frames are applied as they arrive; pass a schedule to hold them like an animation frame would. */
function setup(schedule: (flush: () => void) => void = (flush) => flush()) {
  const fake = fakeTransport();
  const session = createTranscriptSession("thread", fake.transport, { schedule });
  const snapshot = () => session.getSnapshot();
  const view = () => selectTranscript(snapshot().state);
  const lastTurn = () => view().turns[view().turns.length - 1];
  return { fake, session, snapshot, view, lastTurn };
}

/** An opened thread with its history loaded and the resume stream closed. */
async function opened() {
  const t = setup();
  t.session.open();
  t.fake.last().push(...history, bookmark, complete, "end");
  await settle();
  return t;
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.useFakeTimers();
  // Dropped streams are reported as warnings; keep the test output clean and assert on them where it matters.
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("opening a thread", () => {
  it("loads until the bookmark, then shows history", async () => {
    const t = setup();
    t.session.open();
    expect(t.snapshot().load).toBe("loading");
    t.fake.last().push(...history);
    await settle();
    expect(t.snapshot().load).toBe("loading");
    t.fake.last().push(bookmark, complete, "end");
    await settle();
    expect(t.snapshot()).toMatchObject({ load: "ready", connection: "idle" });
    expect(t.view().turns).toHaveLength(1);
  });

  it("fails the load when the stream dies before the bookmark, and retries on request", async () => {
    const t = setup();
    t.session.open();
    t.fake.last().push(new Error("502"));
    await settle();
    expect(t.snapshot().load).toBe("failed");
    t.session.resume();
    t.fake.last().push(...history, bookmark, complete, "end");
    await settle();
    expect(t.snapshot().load).toBe("ready");
  });
});

describe("opening a legacy v1 thread", () => {
  it("UC-39 opens with no bookmark to wait for, instead of reporting a failed load", async () => {
    const t = setup();
    t.session.open();
    t.fake
      .last()
      .push(
        { event: "protocol", data: '{"version":1}' },
        f("message", { kind: "user", seq: 1, body: "Hi" }),
        f("done", {}),
        "end",
      );
    await settle();
    expect(t.snapshot()).toMatchObject({ load: "ready", connection: "idle" });
    expect(t.view().legacy).toBe(true);
  });
});

describe("a live turn", () => {
  it("completes, keeping one connection at a time", async () => {
    const t = await opened();
    t.session.send("How did Q3 do?");
    expect(t.lastTurn()).toMatchObject({ user: { content: "How did Q3 do?" }, status: "streaming" });
    expect(t.fake.open()).toBe(1);
    t.fake.last().push(text("a2", "Blended ROAS ", "streaming"), text("a2", "Blended ROAS 3.1"), complete, "end");
    await settle();
    expect(t.lastTurn().status).toBe("completed");
    expect(t.snapshot().connection).toBe("idle");
    expect(t.fake.open()).toBe(0);
  });

  it("UC-7 ignores a second send while a turn streams", async () => {
    const t = await opened();
    t.session.send("first");
    t.session.send("second");
    expect(t.fake.sends()).toBe(1);
  });

  it("fails when the stream closes right after an error", async () => {
    const t = await opened();
    t.session.send("go");
    t.fake.last().push(f("error", { title: "Crashed", status: 500 }), "end");
    await settle();
    expect(t.lastTurn().status).toBe("failed");
  });

  it("is interrupted when the connection drops, and the reason is reported", async () => {
    const t = await opened();
    t.session.send("go");
    t.fake.last().push(text("a2", "partial", "streaming"), new TypeError("network"));
    await settle();
    expect(t.lastTurn()).toMatchObject({ status: "interrupted", blocks: [{ text: "partial" }] });
    expect(warn).toHaveBeenCalledWith("[transcript stream]", expect.any(TypeError));
  });
});

describe("stop", () => {
  it("aborts at once, keeps what arrived and cancels the turn exactly once", async () => {
    const t = await opened();
    t.session.send("go");
    const stream = t.fake.last();
    stream.push(text("a2", "partial", "streaming"));
    await settle();
    t.session.stop();
    t.session.stop();
    expect(stream.signal.aborted).toBe(true);
    expect(t.fake.cancel).toHaveBeenCalledTimes(1);
    expect(t.lastTurn()).toMatchObject({ status: "stopped", blocks: [{ text: "partial" }] });
    expect(t.snapshot().connection).toBe("idle");
    stream.push(text("a2", "late text"));
    await settle();
    expect(t.lastTurn().blocks[0]).toMatchObject({ text: "partial" });
  });
});

describe("silence and stalls", () => {
  it("UC-28 stays open through 75 seconds of keep-alives", async () => {
    const t = await opened();
    t.session.send("go");
    for (let s = 0; s < 15; s++) {
      await vi.advanceTimersByTimeAsync(5_000);
      t.fake.last().push(keepAlive);
    }
    await settle();
    expect(t.lastTurn().status).toBe("streaming");
    expect(t.fake.resumes()).toBe(1);
  });

  it("UC-29 resumes by itself after 15 seconds of total silence (silent-stall)", async () => {
    const t = await opened();
    t.session.send("go");
    t.fake.last().push(text("a2", "The site has ", "streaming"));
    await vi.advanceTimersByTimeAsync(15_000);
    expect(t.fake.resumes()).toBe(2);
    expect(t.snapshot().connection).toBe("reconnecting");
    // The old transcript stays on screen while the resume replays.
    expect(t.lastTurn().blocks[0]).toMatchObject({ text: "The site has " });

    t.fake.last().push(...history, f("final", { type: "user", id: "user-1", content: "go", timestamp: "" }), bookmark);
    t.fake.last().push(text("a2", "The site has ", "streaming"), text("a2", "three issues", "streaming"));
    await settle();
    expect(t.snapshot().connection).toBe("streaming");
    expect(t.lastTurn()).toMatchObject({ status: "streaming", blocks: [{ text: "The site has three issues" }] });
  });

  it("UC-29 keeps resuming while the turn stays silent, then hands the decision to the user", async () => {
    const t = await opened();
    t.session.send("go");
    for (let attempt = 0; attempt < 5; attempt++) await vi.advanceTimersByTimeAsync(15_000);
    // The thread's opening resume, then four automatic ones; the fifth stall gives up.
    expect(t.fake.resumes()).toBe(5);
    expect(t.lastTurn().status).toBe("interrupted");
    expect(t.snapshot().connection).toBe("idle");
  });
});

describe("resume after an interruption", () => {
  it("UC-30 replaces the transcript at the bookmark without duplicating anything", async () => {
    const t = await opened();
    t.session.send("go");
    t.fake.last().push(text("a2", "partial", "streaming"), new TypeError("network"));
    await settle();
    t.session.resume();
    const user1 = f("final", { type: "user", id: "user-1", content: "go", timestamp: "" });
    t.fake.last().push(...history, user1, text("a2", "the whole answer"), bookmark, complete, "end");
    await settle();
    const v = t.view();
    expect(v.turns).toHaveLength(2);
    expect(v.turns[1]).toMatchObject({ status: "completed", blocks: [{ text: "the whole answer" }] });
  });
});

describe("switching threads", () => {
  it("UC-5 disposing a session closes its stream and ignores anything that arrives after", async () => {
    const t = await opened();
    t.fake.options.leaky = true;
    t.session.send("go");
    const stream = t.fake.last();
    t.session.dispose();
    expect(stream.signal.aborted).toBe(true);
    stream.push(text("a2", "from the old thread"));
    await settle();
    expect(t.lastTurn().blocks).toEqual([]);
    expect(stream.signal.aborted).toBe(true);
  });
});

describe("a refused send", () => {
  it("reports a refused send as a failed turn with its reason, not as a dropped connection", async () => {
    const t = await opened();
    t.session.send("go");
    t.fake.last().push(new Error("/api/threads/thread/turns failed: 409"));
    await settle();
    expect(t.lastTurn().status).toBe("failed");
    expect(t.lastTurn().blocks[0]).toMatchObject({
      kind: "problem",
      problem: { title: "Your message couldn't be sent" },
    });
  });
});
