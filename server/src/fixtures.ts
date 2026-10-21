import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type Frame = { event: string; data: string };

/** Internal marker: which scope a settled message belongs to. Stripped before it reaches the wire. */
export const BELONGS_TO_SCOPE = "__scope";
/** History entries that are not messages — an `error` frame is content, and reopening a thread must not lose it. */
export const ON_CHANNEL = "__channel";
/** Internal marker preserving a legacy message's wire identity in settled history. */
export const V1_SEQUENCE = "__v1Seq";

/** Allocates stable legacy identities for one thread, including messages restored from its live stream. */
export function createV1Sequence(): (message: Record<string, unknown>) => number {
  let next = 0;
  const byIdentity = new Map<string, number>();
  return (message) => {
    const stored = message[V1_SEQUENCE];
    if (typeof stored === "number") {
      next = Math.max(next, stored);
      return stored;
    }
    const key = typeof message.id === "string"
      ? JSON.stringify([message[BELONGS_TO_SCOPE] ?? null, message.type, message.id])
      : null;
    const known = key === null ? undefined : byIdentity.get(key);
    if (known !== undefined) {
      return known;
    }
    const seq = ++next;
    if (key !== null) {
      byIdentity.set(key, seq);
    }
    return seq;
  };
}

export type FixtureItem =
  | { kind: "frame"; frame: Frame }
  | { kind: "pause"; ms: number }
  | { kind: "delay"; ms: number }
  | { kind: "stall"; ms: number }
  | { kind: "kill" };

export type Fixture = {
  /** auto: the server chunks and paces settled frames. manual: frames replay verbatim with `delay` directives. */
  mode: "auto" | "manual";
  /** Everything before the first `: turn` — the thread's existing history. */
  history: FixtureItem[];
  /** Each `: turn` block — queued turns, streamed one per POST /turns. */
  turns: FixtureItem[][];
};

export type ThreadConfig = {
  id: string;
  title: string;
  protocol: 1 | 2;
  /** For threads migrated between protocol versions: replay history at `protocol`, stream new turns at this version. */
  turn_protocol?: 1 | 2;
  updated_at: string;
  fixture: string;
};

export function loadThreadIndex(fixturesDir: string): ThreadConfig[] {
  const index = JSON.parse(readFileSync(join(fixturesDir, "threads.json"), "utf8")) as ThreadConfig[];
  const known = new Set(readdirSync(fixturesDir));
  for (const thread of index) {
    if (!known.has(thread.fixture)) {
      throw new Error(`threads.json references missing fixture: ${thread.fixture}`);
    }
  }
  return index;
}

export function parseFixture(fixturesDir: string, fileName: string): Fixture {
  const text = readFileSync(join(fixturesDir, fileName), "utf8");
  const fixture: Fixture = { history: [], mode: "auto", turns: [] };
  let current: FixtureItem[] = fixture.history;

  let event = "";
  let data: string[] = [];
  let hasFrame = false;

  const flushFrame = () => {
    if (hasFrame) {
      current.push({ frame: { data: data.join("\n"), event }, kind: "frame" });
    }
    event = "";
    data = [];
    hasFrame = false;
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\r$/, "");

    if (line.startsWith(":")) {
      flushFrame();
      const [directive, argument] = line.slice(1).trim().split(/\s+/, 2);
      switch (directive) {
        case "mode":
          fixture.mode = argument === "manual" ? "manual" : "auto";
          break;
        case "turn":
          flushFrame();
          current = [];
          fixture.turns.push(current);
          break;
        case "pause":
          current.push({ kind: "pause", ms: Number(argument) });
          break;
        case "delay":
          current.push({ kind: "delay", ms: Number(argument) });
          break;
        // Silence with the keep-alives switched off: the socket is open and
        // nothing is coming. Indistinguishable from a healthy pause except that
        // the keep-alives stopped, which is the whole point.
        case "stall":
          current.push({ kind: "stall", ms: Number(argument) });
          break;
        case "kill":
          current.push({ kind: "kill" });
          break;
        // Any other comment line is prose, not a directive.
        default:
          break;
      }
    } else if (line === "") {
      flushFrame();
    } else if (line.startsWith("event:")) {
      event = line.slice("event:".length).trimStart();
      hasFrame = true;
    } else if (line.startsWith("data:")) {
      data.push(line.slice("data:".length).trimStart());
      hasFrame = true;
    } else {
      throw new Error(`${fileName}: unparseable line: ${line}`);
    }
  }
  flushFrame();
  return fixture;
}

/** Settled message payloads (with scope attribution) from a list of items — used for paged history. */
/** Accepts fixture items or the frames a turn actually emitted — both carry `{kind, frame}`. */
export function settledMessages(items: readonly { kind: string; frame?: Frame }[]): Record<string, unknown>[] {
  const messages: Record<string, unknown>[] = [];
  for (const item of items) {
    if (item.kind !== "frame" || !item.frame) {
      continue;
    }
    const [channel, scopeId] = item.frame.event.split("|", 2);
    if (channel === "complete") {
      break;
    }
    if (channel === "error") {
      messages.push({ [ON_CHANNEL]: "error", ...safeParse(item.frame.data) });
      continue;
    }
    if (channel !== "final") {
      continue;
    }
    // A fixture may carry a deliberately malformed frame; skip it rather than
    // taking the whole service down while loading fixtures at boot.
    let parsed: Record<string, unknown> | Record<string, unknown>[];
    try {
      parsed = JSON.parse(item.frame.data) as Record<string, unknown> | Record<string, unknown>[];
    } catch {
      continue;
    }
    for (const message of Array.isArray(parsed) ? parsed : [parsed]) {
      // The scope a message BELONGS TO travels separately from an agent
      // action's own `scope_id`, which names the scope it OPENS.
      messages.push(scopeId ? { ...message, [BELONGS_TO_SCOPE]: scopeId } : message);
    }
  }
  return messages;
}

/**
 * What a client actually saw, reduced to settled messages.
 *
 * A turn that was stopped or dropped may never have sent a `final` for the
 * message it was midway through, so taking only `final` frames would discard
 * text the user watched arrive. Streaming chunks are accumulated per id and
 * kept when nothing settled them.
 */
export function observedMessages(events: readonly { kind: string; frame?: Frame }[]): Record<string, unknown>[] {
  const order: string[] = [];
  const byKey = new Map<string, Record<string, unknown>>();

  for (const event of events) {
    if (event.kind !== "frame" || !event.frame) {
      continue;
    }
    const [channel, scopeId] = event.frame.event.split("|", 2);
    if (channel === "complete") {
      break;
    }
    if (channel === "error") {
      const key = `error:${order.length}`;
      order.push(key);
      byKey.set(key, { [ON_CHANNEL]: "error", ...safeParse(event.frame.data) });
      continue;
    }
    if (channel === "message") {
      const folded = foldV1(safeParse(event.frame.data), byKey.get.bind(byKey));
      if (folded) {
        if (!byKey.has(folded.key)) {
          order.push(folded.key);
        }
        byKey.set(folded.key, folded.message);
      }
      continue;
    }
    if (channel !== "final" && channel !== "streaming") {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(event.frame.data);
    } catch {
      continue;
    }
    for (const message of (Array.isArray(parsed) ? parsed : [parsed]) as Record<string, unknown>[]) {
      const id = typeof message.id === "string" ? message.id : null;
      const key = `${scopeId ?? ""}:${id ?? order.length}`;
      const tagged = scopeId ? { ...message, [BELONGS_TO_SCOPE]: scopeId } : { ...message };
      const existing = byKey.get(key);
      if (!existing) {
        order.push(key);
        byKey.set(key, tagged);
        continue;
      }
      if (channel === "final") {
        byKey.set(key, tagged);
      } else if (typeof existing.content === "string" && typeof message.content === "string") {
        byKey.set(key, { ...existing, content: existing.content + message.content });
      }
    }
  }
  return order.map((key) => byKey.get(key)!).filter(Boolean);
}


/** Frame payloads come from fixtures, which are allowed to be malformed on purpose. */
function safeParse(data: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(data);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}


/**
 * v1 turns arrive on the `message` channel in the legacy shape. History is kept
 * in the v2 shape and rendered back to v1 on read, so a legacy frame is folded
 * to its v2 equivalent here — otherwise a v1 turn vanishes when the thread is
 * reopened.
 */
function foldV1(
  payload: Record<string, unknown>,
  lookup: (key: string) => Record<string, unknown> | undefined,
): { key: string; message: Record<string, unknown> } | null {
  const kind = typeof payload.kind === "string" ? payload.kind : "";
  const key = `v1:${kind}:${String(payload.seq ?? "")}`;
  const identity = { id: key, [V1_SEQUENCE]: payload.seq };

  if (kind === "user") {
    return { key, message: { ...identity, content: payload.body ?? "", timestamp: payload.at, type: "user" } };
  }
  if (kind === "bot") {
    const carried = typeof lookup(key)?.content === "string" ? String(lookup(key)?.content) : "";
    const content = typeof payload.body === "string" ? payload.body : carried + String(payload.append ?? "");
    return { key, message: { ...identity, content, type: "assistant" } };
  }
  if (kind === "tool") {
    const status = payload.status;
    return {
      key,
      message: {
        ...identity,
        artifacts: Array.isArray(payload.attachments) ? payload.attachments : [],
        has_succeeded: status === "ok" ? true : status === "error" ? false : null,
        results: [],
        title: payload.name ?? "tool",
        type: "action",
      },
    };
  }
  return null;
}
