import { readFileSync } from "node:fs";

import type { StreamFrame } from "../api/types";
import type { Fixture } from "./types";

const FIXTURES = new URL("../../../fixtures/", import.meta.url).pathname;

/**
 * Reads a fixture the way the mock service does: frames before the first
 * `: turn` are history, and each `: turn` starts one queued turn.
 */
export function loadFixture(name: string): Fixture {
  const text = readFileSync(FIXTURES + name, "utf8");
  const [history, ...turns] = text.split(/^: turn$/m);
  return {
    name,
    manual: /^: mode manual$/m.test(text),
    history: framesOf(history),
    turns: turns.map((turn) => {
      // Frames after a kill exist server-side but never reach the client that was connected.
      const [sent, afterKill] = turn.split(/^: kill$/m);
      return { frames: framesOf(sent), killed: afterKill !== undefined };
    }),
  };
}

/** The `event:` / `data:` pairs of one section; the protocol frame is left out. */
function framesOf(section: string): StreamFrame[] {
  const frames: StreamFrame[] = [];
  let event = "";
  for (const line of section.split("\n")) {
    if (line.startsWith("event: ")) event = line.slice("event: ".length);
    else if (line.startsWith("data: ") && event !== "protocol")
      frames.push({ event, data: line.slice("data: ".length) });
  }
  return frames;
}
