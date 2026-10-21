import type { FixtureItem, Frame } from "./fixtures";
import { BELONGS_TO_SCOPE, createV1Sequence } from "./fixtures";
import { actionDelayMs, initialTextDelayMs, textChunkDelayMs, type TextMessageType } from "./pacing";

export type SinkEvent = { kind: "frame"; frame: Frame } | { kind: "comment"; text: string } | { kind: "kill" };

export type Subscriber = (event: SinkEvent) => void;

const speed = Math.max(Number(process.env.MOCK_SPEED) || 1, 0.01);
const keepAliveIntervalMs = 5000;

export class ActiveTurn {
  readonly emitted: SinkEvent[] = [];
  private readonly subscribers = new Set<Subscriber>();
  private readonly abort = new AbortController();
  private resolveDone!: () => void;
  readonly done = new Promise<void>((resolve) => {
    this.resolveDone = resolve;
  });

  subscribe(subscriber: Subscriber): () => void {
    for (const event of this.emitted) {
      // A kill is the original socket dropping — it applies live, never on replay.
      if (event.kind !== "kill") {
        subscriber(event);
      }
    }
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }

  cancel(): void {
    this.abort.abort();
  }

  get signal(): AbortSignal {
    return this.abort.signal;
  }

  emit(event: SinkEvent): void {
    this.emitted.push(event);
    for (const subscriber of this.subscribers) {
      subscriber(event);
    }
  }

  finish(): void {
    this.resolveDone();
  }
}

/**
 * Plays a turn's fixture items into the ActiveTurn buffer. Runs detached from
 * any socket: a disconnected client does not stop the turn (just like
 * production). Cancellation via turn.cancel() does.
 */
export async function playTurn(
  turn: ActiveTurn,
  items: FixtureItem[],
  protocol: 1 | 2,
  seed: string,
  mode: "auto" | "manual" = "auto",
  v1Sequence = createV1Sequence(),
): Promise<void> {
  const random = mulberry32(hashCode(seed));
  const plan = mode === "manual"
    ? planManual(items)
    : protocol === 1 ? planV1(items, random, v1Sequence) : planV2(items, random);
  let sawTerminal = false;

  try {
    for (const step of plan) {
      if (turn.signal.aborted) {
        turn.emit({ frame: terminalFrame(protocol), kind: "frame" });
        return;
      }
      if (step.waitMs) {
        await sleep(step.waitMs / speed, turn.signal, (comment) => turn.emit(comment));
        if (turn.signal.aborted) {
          turn.emit({ frame: terminalFrame(protocol), kind: "frame" });
          return;
        }
      }
      if (step.silentMs) {
        // No keep-alives: the socket stays open and stops saying anything. This
        // is what a dying connection looks like from the client, and the only
        // thing separating it from a healthy pause is the missing keep-alive.
        await delay(step.silentMs / speed, turn.signal);
        if (turn.signal.aborted) {
          turn.emit({ frame: terminalFrame(protocol), kind: "frame" });
          return;
        }
      }
      if (step.event) {
        if (step.event.kind === "frame") {
          const channel = step.event.frame.event.split("|", 2)[0];
          if (channel === "complete" || channel === "error" || channel === "done" || channel === "fail") {
            sawTerminal = channel === "complete" || channel === "done";
          }
        }
        turn.emit(step.event);
        if (step.event.kind === "kill") {
          sawTerminal = true;
        }
      }
    }
    if (!sawTerminal && plan.autoComplete) {
      turn.emit({ frame: terminalFrame(protocol), kind: "frame" });
    }
  } finally {
    turn.finish();
  }
}

export function terminalFrame(protocol: 1 | 2): Frame {
  return protocol === 1 ? { data: "{}", event: "done" } : { data: "{}", event: "complete" };
}

export function protocolFrame(protocol: 1 | 2): Frame {
  return { data: JSON.stringify({ version: protocol }), event: "protocol" };
}

/** `silentMs` waits like `waitMs` but emits no keep-alives — a connection going quiet without saying so. */
type Step = { waitMs?: number; silentMs?: number; event?: SinkEvent };
type Plan = Step[] & { autoComplete?: boolean };
type PlanClock = { elapsedMs: number };
type PlannedAction = { message: Record<string, unknown>; settled: boolean; startedAtMs: number };

// ---- manual planning: frames replay verbatim, nothing is synthesized ----

function planManual(items: FixtureItem[]): Plan {
  const plan: Plan = [];
  plan.autoComplete = false;
  for (const item of items) {
    switch (item.kind) {
      case "pause":
      case "delay":
        plan.push({ waitMs: item.ms });
        break;
      case "stall":
        plan.push({ silentMs: item.ms });
        break;
      case "kill":
        plan.push({ event: { kind: "kill" } });
        break;
      case "frame":
        plan.push({ event: { frame: item.frame, kind: "frame" } });
        break;
    }
  }
  return plan;
}

// ---- v2 planning ----

export function planV2(items: FixtureItem[], random: () => number): Plan {
  const plan: Plan = [];
  plan.autoComplete = true;
  const clock: PlanClock = { elapsedMs: 0 };
  let manualSeen = false;
  let lastChannel = "";
  const plannedActions = new Map<string, PlannedAction>();

  for (const item of items) {
    switch (item.kind) {
      case "pause":
        appendStep(plan, clock, { waitMs: item.ms });
        break;
      case "stall":
        appendStep(plan, clock, { silentMs: item.ms });
        break;
      case "delay":
        appendStep(plan, clock, { waitMs: item.ms });
        manualSeen = true;
        break;
      case "kill":
        appendStep(plan, clock, { event: { kind: "kill" } });
        plan.autoComplete = false;
        break;
      case "frame": {
        const [channel, scopeId] = item.frame.event.split("|", 2);
        lastChannel = channel;
        if (channel === "streaming") {
          appendStep(plan, clock, { event: { frame: item.frame, kind: "frame" } });
          manualSeen = true;
          plan.autoComplete = false;
          break;
        }
        if (channel !== "final") {
          appendStep(plan, clock, { event: { frame: item.frame, kind: "frame" } });
          if (channel === "complete") {
            plan.autoComplete = false;
          }
          break;
        }
        for (const step of expandFinalV2(item.frame, scopeId, random, plannedActions, clock)) {
          appendStep(plan, clock, step);
        }
        break;
      }
    }
  }
  if (manualSeen) {
    plan.autoComplete = false;
  }
  // A turn whose last word is an error ended on that error. Completing it for
  // the fixture would make every error recoverable, which is not the contract.
  if (lastChannel === "error") {
    plan.autoComplete = false;
  }
  return plan;
}

function expandFinalV2(
  frame: Frame,
  scopeId: string | undefined,
  random: () => number,
  plannedActions: Map<string, PlannedAction>,
  clock: PlanClock,
): Step[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(frame.data);
  } catch {
    return [{ event: { frame, kind: "frame" } }];
  }
  if (Array.isArray(parsed)) {
    return [{ event: { frame, kind: "frame" }, waitMs: 30 }];
  }

  const message = parsed as Record<string, unknown>;
  const eventName = scopeId ? `streaming|${scopeId}` : "streaming";
  const steps: Step[] = [];

  if ((message.type === "assistant" || message.type === "thinking") && typeof message.content === "string") {
    const type = message.type as TextMessageType;
    let previousChunk = "";
    for (const [index, chunk] of chunkText(message.content, random).entries()) {
      steps.push({
        event: {
          frame: { data: JSON.stringify({ ...message, content: chunk }), event: eventName },
          kind: "frame",
        },
        waitMs: index === 0 ? initialTextDelayMs(type, random) : textChunkDelayMs(type, previousChunk, random),
      });
      previousChunk = chunk;
    }
    steps.push({ event: { frame, kind: "frame" }, waitMs: 30 });
    return steps;
  }

  if (message.type === "action") {
    const id = typeof message.id === "string" ? message.id : "";
    const key = `${scopeId ?? "root"}:${id}`;
    const prior = plannedActions.get(key);
    const settled = message.has_succeeded === true || message.has_succeeded === false;
    const combined = { ...prior?.message, ...message };
    const updateDelay = 60 + random() * 120;

    if (!settled) {
      plannedActions.set(key, {
        message: combined,
        settled: false,
        startedAtMs: prior?.startedAtMs ?? clock.elapsedMs + updateDelay,
      });
      return [{ event: { frame, kind: "frame" }, waitMs: updateDelay }];
    }

    if (prior?.settled) {
      plannedActions.set(key, { ...prior, message: combined });
      return [{ event: { frame, kind: "frame" }, waitMs: updateDelay }];
    }
    if (prior) {
      const duration = actionDelayMs(message, prior.message, random);
      const remaining = prior.startedAtMs + duration - clock.elapsedMs;
      plannedActions.set(key, { message: combined, settled: true, startedAtMs: prior.startedAtMs });
      return [{ event: { frame, kind: "frame" }, waitMs: Math.max(updateDelay, remaining) }];
    }

    const startedAtMs = clock.elapsedMs + updateDelay;
    plannedActions.set(key, { message: combined, settled: true, startedAtMs });
    const running = { ...message, artifacts: [], ended_at: undefined, has_succeeded: null, results: [] };
    steps.push({
      event: { frame: { data: JSON.stringify(running), event: eventName }, kind: "frame" },
      waitMs: updateDelay,
    });
    steps.push({ event: { frame, kind: "frame" }, waitMs: actionDelayMs(message, undefined, random) });
    return steps;
  }

  return [{ event: { frame, kind: "frame" }, waitMs: 30 }];
}

// ---- v1 planning (legacy protocol; see PROTOCOL_V1.md) ----

function planV1(
  items: FixtureItem[],
  random: () => number,
  sequenceFor: (message: Record<string, unknown>) => number,
): Plan {
  const plan: Plan = [];
  plan.autoComplete = true;
  let lastChannel = "";

  for (const item of items) {
    switch (item.kind) {
      case "pause":
      case "delay":
        plan.push({ waitMs: item.ms });
        break;
      case "kill":
        plan.push({ event: { kind: "kill" } });
        plan.autoComplete = false;
        break;
      case "frame": {
        const [channel, scopeId] = item.frame.event.split("|", 2);
        lastChannel = channel;
        if (channel === "error") {
          plan.push(v1Step({ kind: "fail", message: safeDetail(item.frame.data) }, "fail"));
          break;
        }
        if (channel === "complete") {
          plan.push(v1Step({}, "done"));
          plan.autoComplete = false;
          break;
        }
        if (channel !== "final") {
          break;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(item.frame.data);
        } catch {
          break;
        }
        for (const message of Array.isArray(parsed) ? parsed : [parsed]) {
          if (!message || !["user", "assistant", "action"].includes(message.type)) {
            continue;
          }
          const seq = sequenceFor(scopeId ? { ...message, [BELONGS_TO_SCOPE]: scopeId } : message);
          for (const step of expandMessageV1(message as Record<string, unknown>, seq, random)) {
            plan.push(step);
          }
        }
        break;
      }
    }
  }
  // A v1 turn whose last word is an error ended on that error, same as v2.
  if (lastChannel === "error") {
    plan.autoComplete = false;
  }
  return plan;
}

function expandMessageV1(message: Record<string, unknown>, seq: number, random: () => number): Step[] {
  switch (message.type) {
    case "user":
      return [
        v1Step({ at: message.timestamp, body: message.content, kind: "user", seq }, "message", 20),
      ];
    case "assistant": {
      const steps: Step[] = [];
      let previousChunk = "";
      for (const [index, chunk] of chunkText(String(message.content ?? ""), random).entries()) {
        const waitMs =
          index === 0
            ? initialTextDelayMs("assistant", random)
            : textChunkDelayMs("assistant", previousChunk, random);
        steps.push(v1Step({ append: chunk, kind: "bot", seq }, "message", waitMs));
        previousChunk = chunk;
      }
      steps.push(v1Step({ body: String(message.content ?? ""), done: true, kind: "bot", seq }, "message", 30));
      return steps;
    }
    case "action": {
      const name = String(message.title ?? "tool");
      const attachments = Array.isArray(message.artifacts) ? message.artifacts : [];
      return [
        v1Step({ kind: "tool", name, seq, status: "running" }, "message", 60 + random() * 120),
        v1Step(
          {
            attachments,
            kind: "tool",
            name,
            seq,
            status: message.has_succeeded === false ? "error" : "ok",
          },
          "message",
          actionDelayMs(message, undefined, random),
        ),
      ];
    }
    // thinking, commands, artifact references, bookmarks, and metadata do not exist in v1
    default:
      return [];
  }
}

function v1Step(payload: Record<string, unknown>, event: string, waitMs?: number): Step {
  return { event: { frame: { data: JSON.stringify(payload), event }, kind: "frame" }, waitMs };
}

function appendStep(plan: Plan, clock: PlanClock, step: Step): void {
  plan.push(step);
  clock.elapsedMs += (step.waitMs ?? 0) + (step.silentMs ?? 0);
}

function safeDetail(data: string): string {
  try {
    const parsed = JSON.parse(data) as Record<string, unknown>;
    return String(parsed.detail ?? parsed.title ?? "something went wrong");
  } catch {
    return "something went wrong";
  }
}

// ---- helpers ----

function chunkText(text: string, random: () => number): string[] {
  const words = text.split(/(?<=\s)/);
  const chunks: string[] = [];
  let index = 0;
  while (index < words.length) {
    const take = 1 + Math.floor(random() * 3);
    chunks.push(words.slice(index, index + take).join(""));
    index += take;
  }
  return chunks;
}

async function sleep(ms: number, signal: AbortSignal, onKeepAlive: (comment: SinkEvent) => void): Promise<void> {
  // The interval scales with the pause it fills, so a silence carries the same
  // number of keep-alives at every MOCK_SPEED. Left unscaled, turning playback
  // up deletes the frames a stall detector is built against.
  const interval = keepAliveIntervalMs / speed;
  let remaining = ms;
  while (remaining > 0 && !signal.aborted) {
    const slice = Math.min(remaining, interval);
    await delay(slice, signal);
    remaining -= slice;
    if (remaining > 0 && !signal.aborted) {
      onKeepAlive({ kind: "comment", text: "ka" });
    }
  }
}

/** Resolves after `ms`, or the moment the turn is aborted — a stop should not wait out the pause it landed in. */
function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal.addEventListener("abort", finish, { once: true });
  });
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashCode(text: string): number {
  let hash = 0;
  for (let index = 0; index < text.length; index++) {
    hash = (Math.imul(hash, 31) + text.charCodeAt(index)) | 0;
  }
  return hash;
}
