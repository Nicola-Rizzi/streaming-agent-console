import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import { once } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createMockServer } from "./index";

type LegacyMessage = { seq: number; kind: string; body?: string; append?: string; done?: boolean };

let server: Server;
let baseUrl: string;
let fixturesDir: string;

function final(message: Record<string, unknown>): string {
  return `event: final\ndata: ${JSON.stringify(message)}\n\n`;
}

beforeAll(async () => {
  fixturesDir = mkdtempSync(join(tmpdir(), "console-legacy-identity-"));
  writeFileSync(join(fixturesDir, "threads.json"), JSON.stringify([
    { id: "legacy", title: "Legacy", protocol: 1, updated_at: "2026-09-01T00:00:00Z", fixture: "legacy.sse" },
  ]));
  const history = Array.from({ length: 35 }, (_, index) =>
    final({ type: "assistant", id: `history-${index}`, content: `History ${index}` }),
  ).join("");
  writeFileSync(join(fixturesDir, "legacy.sse"), history + ": turn\n" +
    final({ type: "assistant", id: "answer-one", content: "A" }) + ": delay 400\n" +
    final({ type: "assistant", id: "answer-one", content: "B" }) + ": turn\n" +
    final({ type: "assistant", id: "answer-two", content: "C" }));
  server = createMockServer(fixturesDir);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

afterEach(async () => {
  await fetch(`${baseUrl}/reset`, { method: "POST" });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  });
  rmSync(fixturesDir, { recursive: true, force: true });
});

function messages(text: string): LegacyMessage[] {
  return text.split("\n\n").filter((frame) => frame.startsWith("event: message\n"))
    .map((frame) => JSON.parse(frame.split("\ndata: ")[1]!) as LegacyMessage);
}

async function history(): Promise<LegacyMessage[]> {
  let cursor: string | null = null;
  const all: LegacyMessage[] = [];
  do {
    const response = await fetch(`${baseUrl}/threads/legacy/messages${cursor === null ? "" : `?cursor=${cursor}`}`);
    const page = await response.json() as { messages: LegacyMessage[]; next_cursor: string | null };
    all.unshift(...page.messages);
    cursor = page.next_cursor;
  } while (cursor !== null);
  return all;
}

async function startTurn(): Promise<Response> {
  const response = await fetch(`${baseUrl}/threads/legacy/turns`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "Continue" }),
  });
  expect(response.status).toBe(200);
  return response;
}

describe("legacy identity across HTTP delivery paths", () => {
  it("preserves identities through live resume, replacement, later turns and paged history", async () => {
    const before = await history();
    const response = await startTurn();
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let liveText = "";
    while (!liveText.includes('"append"')) {
      const next = await reader.read();
      expect(next.done).toBe(false);
      liveText += decoder.decode(next.value, { stream: true });
    }
    const resumed = await fetch(`${baseUrl}/threads/legacy/resume`);
    const replayTextPromise = resumed.text();
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      liveText += decoder.decode(next.value, { stream: true });
    }
    const live = messages(liveText);
    const seq = live[0]!.seq;
    expect(seq).toBeGreaterThan(Math.max(...before.map((message) => message.seq)));
    expect(new Set(live.map((message) => message.seq))).toEqual(new Set([seq]));
    expect(live.filter((message) => message.done).map((message) => message.body)).toEqual(["A", "B"]);
    const replay = messages(await replayTextPromise);
    expect(replay.filter((message) => message.append).map((message) => message.seq)).toEqual([seq, seq]);
    expect(replay.slice(0, before.length)).toEqual(before);

    const second = messages(await (await startTurn()).text());
    expect(second[0]!.seq).toBeGreaterThan(seq);
    const after = await history();
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.find((message) => message.seq === seq)?.body).toBe("B");
    expect(after.find((message) => message.seq === second[0]!.seq)?.body).toBe("C");
    expect(new Set(after.map((message) => message.seq)).size).toBe(after.length);
    const settledReplay = messages(await (await fetch(`${baseUrl}/threads/legacy/resume`)).text());
    expect(settledReplay).toEqual(after);
  });

  it("allocates beyond unread history and resets sequence with the thread data", async () => {
    const first = messages(await (await startTurn()).text());
    expect(first[0]!.seq).toBeGreaterThan(35);
    await fetch(`${baseUrl}/reset`, { method: "POST" });
    const resetHistory = await history();
    expect(resetHistory).toHaveLength(35);
    expect(resetHistory[0]!.seq).toBe(1);
    const restarted = messages(await (await startTurn()).text());
    expect(restarted[0]!.seq).toBe(first[0]!.seq);
  });
});
