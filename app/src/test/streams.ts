import type { StreamFrame } from "../api/types";
import { bookmark, complete, f } from "./transcript";
import type { Fixture, FixtureTurn } from "./types";

const protocolV2 = f("protocol", { version: 2 });

/**
 * What the client receives for one live turn, close to what the service sends:
 * each final is preceded by what streams before it, and the turn ends with
 * `complete` unless it ended on an error or was killed.
 */
export function liveTurn(fixture: Fixture, turn: FixtureTurn, random: () => number): StreamFrame[] {
  const seenActions = new Set<string>();
  const frames = [protocolV2];
  for (const frame of turn.frames) {
    // A manual fixture already contains its streaming frames.
    if (!fixture.manual) frames.push(...framesBefore(frame, seenActions, random));
    frames.push(frame);
  }
  const last = turn.frames.at(-1)?.event;
  if (!turn.killed && last !== "error" && last !== "complete") frames.push(complete);
  return frames;
}

/** The resume stream of a thread whose turns have all settled: history as finals, a bookmark, `complete`. */
export function resumeStream(fixture: Fixture): StreamFrame[] {
  const frames = [protocolV2, ...fixture.history];
  fixture.turns.forEach((turn, index) => {
    frames.push(f("final", { type: "user", id: `user-${index + 1}`, content: `turn ${index + 1}`, timestamp: "" }));
    // History holds settled messages only: no deltas, no lifecycle frames.
    frames.push(...turn.frames.filter((frame) => frame.event !== "complete" && !frame.event.startsWith("streaming")));
  });
  return [...frames, bookmark, complete];
}

/** Splits text at random offsets, including inside words and markdown markers. */
function chunks(text: string, random: () => number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length;) {
    const size = 1 + Math.floor(random() * 24);
    out.push(text.slice(i, i + size));
    i += size;
  }
  return out;
}

/**
 * What the service streams ahead of a final: text arrives first as deltas, and an
 * action seen for the first time arrives first as a running copy.
 */
function framesBefore(frame: StreamFrame, seenActions: Set<string>, random: () => number): StreamFrame[] {
  const [channel, scope] = frame.event.split("|", 2);
  const message = channel === "final" ? parse(frame.data) : null;
  if (!message) return [];

  if ((message.type === "assistant" || message.type === "thinking") && typeof message.content === "string") {
    const event = scope ? `streaming|${scope}` : "streaming";
    return chunks(message.content, random).map((content) => ({ event, data: JSON.stringify({ ...message, content }) }));
  }

  if (message.type !== "action") return [];
  const key = `${scope ?? ""}:${String(message.id)}`;
  const firstDelivery = !seenActions.has(key);
  seenActions.add(key);
  if (!firstDelivery || typeof message.has_succeeded !== "boolean") return [];
  return [
    { event: frame.event, data: JSON.stringify({ ...message, has_succeeded: null, results: [], artifacts: [] }) },
  ];
}

function parse(data: string): Record<string, unknown> | null {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}
