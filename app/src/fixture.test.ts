import { readFileSync, readdirSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Reads fixtures straight off disk: the cheapest way to test a reducer, with no
 * server and no network, and every edge case the service produces written down.
 */
const FIXTURES = new URL("../../fixtures/", import.meta.url).pathname;

/** Every `event:`/`data:` pair in a fixture, in order, as the transport would hand them over. */
function framesOf(name: string): { event: string; data: string }[] {
  const frames: { event: string; data: string }[] = [];
  let event = "";
  for (const line of readFileSync(FIXTURES + name, "utf8").split("\n")) {
    if (line.startsWith("event: ")) {
      event = line.slice(7);
    } else if (line.startsWith("data: ")) {
      frames.push({ data: line.slice(6), event });
    }
  }
  return frames;
}

describe("fixtures", () => {
  it("parses every recorded stream", () => {
    const names = readdirSync(FIXTURES).filter((name) => name.endsWith(".sse"));
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(framesOf(name).length, name).toBeGreaterThan(0);
    }
  });

  it("hands the welcome thread a first assistant message", () => {
    const frames = framesOf("welcome.sse");
    const assistant = frames.find((frame) => frame.data.includes('"type": "assistant"'));
    expect(assistant).toBeDefined();
  });
});
