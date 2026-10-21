import type { IncomingMessage, Server, ServerResponse } from "node:http";

import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import type { Fixture, FixtureItem, Frame, ThreadConfig } from "./fixtures";

import {
  BELONGS_TO_SCOPE,
  createV1Sequence,
  loadThreadIndex,
  ON_CHANNEL,
  observedMessages,
  parseFixture,
  settledMessages,
  V1_SEQUENCE,
} from "./fixtures";
import { ActiveTurn, playTurn, protocolFrame } from "./playback";

const defaultPort = Number(process.env.PORT) || 8787;
const defaultFixturesDir = resolve(
  process.env.FIXTURES_DIR ?? resolve(dirname(fileURLToPath(import.meta.url)), "../../fixtures"),
);
const threadsPageSize = 20;
const messagesPageSize = 30;

type ThreadState = {
  config: ThreadConfig;
  fixture: Fixture;
  settled: Record<string, unknown>[];
  queue: FixtureItem[][];
  active: ActiveTurn | null;
  admission: symbol | null;
  generation: number;
  turnCounter: number;
  v1Sequence: ReturnType<typeof createV1Sequence>;
};

export function createMockServer(fixturesDir = defaultFixturesDir): Server {
  const threads = new Map<string, ThreadState>();
  for (const config of loadThreadIndex(fixturesDir)) {
    const fixture = parseFixture(fixturesDir, config.fixture);
    threads.set(config.id, {
      active: null,
      admission: null,
      config,
      fixture,
      generation: 0,
      queue: [...fixture.turns],
      settled: settledMessages(fixture.history),
      turnCounter: 0,
      v1Sequence: createV1Sequence(),
    });
  }

  return createServer((request, response) => {
    handle(threads, request, response).catch((cause: unknown) => {
      console.error(cause);
      if (!response.headersSent) {
        sendJson(response, 500, { title: "internal error" });
      } else {
        response.end();
      }
    });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createMockServer();
  server.listen(defaultPort, () => {
    console.log(`mock assistant service on http://localhost:${defaultPort} — fixtures: ${defaultFixturesDir}`);
  });
}

async function handle(
  threads: Map<string, ThreadState>,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const parts = url.pathname.split("/").filter(Boolean);

  if (parts[0] !== "api") {
    sendJson(response, 404, { title: "not found" });
    return;
  }

  if (parts[1] === "threads" && parts.length === 2 && request.method === "GET") {
    listThreads(threads, url, response);
    return;
  }

  if (parts[1] === "reset" && request.method === "POST") {
    resetThreads(threads);
    sendJson(response, 200, { threads: threads.size });
    return;
  }

  const thread = threads.get(parts[2] ?? "");
  if (!thread) {
    sendJson(response, 404, { title: "thread not found" });
    return;
  }

  const tail = parts[3];
  if (tail === "messages" && request.method === "GET") {
    listMessages(thread, url, response);
  } else if (tail === "resume" && request.method === "GET") {
    resume(thread, request, response);
  } else if (tail === "turns" && request.method === "POST") {
    await startTurn(thread, request, response);
  } else if (tail === "cancel" && request.method === "POST") {
    cancel(thread, response);
  } else {
    sendJson(response, 404, { title: "not found" });
  }
}


/** Re-queues every recorded turn, so a thread can be replayed without restarting the service. */
function resetThreads(threads: Map<string, ThreadState>): void {
  for (const thread of threads.values()) {
    thread.generation += 1;
    thread.admission = null;
    thread.active?.cancel();
    thread.active = null;
    thread.queue = [...thread.fixture.turns];
    thread.settled = settledMessages(thread.fixture.history);
    thread.turnCounter = 0;
    thread.v1Sequence = createV1Sequence();
  }
}

function listThreads(threads: Map<string, ThreadState>, url: URL, response: ServerResponse): void {
  const all = [...threads.values()]
    .map((thread) => ({
      id: thread.config.id,
      protocol: thread.config.protocol,
      title: thread.config.title,
      updated_at: thread.config.updated_at,
    }))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  const offset = Number(url.searchParams.get("cursor")) || 0;
  const page = all.slice(offset, offset + threadsPageSize);
  const next = offset + threadsPageSize < all.length ? String(offset + threadsPageSize) : null;
  sendJson(response, 200, { next_cursor: next, threads: page });
}

function listMessages(thread: ThreadState, url: URL, response: ServerResponse): void {
  // A migrated thread streams new turns in v2, so its history contains v2
  // content. Flattening all of it to v1 would strip reasoning and sub-agent
  // detail off a turn the user just watched arrive richly.
  const speaks = turnProtocolOf(thread) === 2 || thread.config.protocol === 2 ? 2 : 1;
  const messages = thread.settled.filter(isMessage);
  const all = speaks === 1 ? settledToV1(messages, thread.v1Sequence) : messages.map(toRestMessage);
  const cursor = url.searchParams.get("cursor");
  const end = cursor === null ? all.length : Number(cursor);
  const start = Math.max(end - messagesPageSize, 0);
  sendJson(response, 200, {
    messages: all.slice(start, end),
    next_cursor: start > 0 ? String(start) : null,
  });
}

function cancel(thread: ThreadState, response: ServerResponse): void {
  if (!thread.active) {
    sendJson(response, 404, { title: "no turn in flight" });
    return;
  }
  thread.active.cancel();
  response.statusCode = 204;
  response.end();
}

async function startTurn(thread: ThreadState, request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (thread.active || thread.admission) {
    sendJson(response, 409, { title: "a turn is already streaming" });
    return;
  }

  const admission = Symbol("turn admission");
  const generation = thread.generation;
  thread.admission = admission;

  try {
    const body = await readBody(request);
    let text = "";
    try {
      text = String((JSON.parse(body) as { text?: unknown }).text ?? "");
    } catch {
      sendJson(response, 400, { title: "invalid JSON body" });
      return;
    }

    if (thread.generation !== generation || thread.admission !== admission) {
      sendJson(response, 409, { title: "thread was reset while starting the turn" });
      return;
    }

    thread.turnCounter += 1;
    thread.settled.push({
      content: text,
      id: `user-${thread.turnCounter}`,
      timestamp: new Date().toISOString(),
      type: "user",
    });

    const items = thread.queue.shift() ?? endOfFixtureTurn(thread.turnCounter);
    const turn = new ActiveTurn();
    thread.active = turn;
    thread.admission = null;

    const turnProtocol = turnProtocolOf(thread);
    if (turnProtocol === 1) {
      settledToV1(thread.settled.filter(isMessage), thread.v1Sequence);
    }
    void playTurn(
      turn, items, turnProtocol, `${thread.config.id}:${thread.turnCounter}`, thread.fixture.mode, thread.v1Sequence,
    ).catch((cause: unknown) => console.error(cause));
    void turn.done.then(() => {
      if (thread.generation !== generation || thread.active !== turn) {
        return;
      }
      thread.active = null;
      // History is what the turn emitted, not what the recording contained:
      // unsettled streaming text is kept, and content the plan never reached
      // after a stop is not resurrected. A `: kill` is the exception — the socket
      // dies but playback runs on, so history holds frames no client received,
      // which is what lets a resume tell the rest of the story.
      thread.settled.push(...observedMessages(turn.emitted));
      thread.config.updated_at = new Date().toISOString();
    });

    openSse(response, request);
    writeFrame(response, protocolFrame(turnProtocol));
    pipeTurn(turn, request, response);
  } finally {
    if (thread.admission === admission) {
      thread.admission = null;
    }
  }
}

function resume(thread: ThreadState, request: IncomingMessage, response: ServerResponse): void {
  openSse(response, request);
  writeFrame(response, protocolFrame(thread.config.protocol));

  if (thread.config.protocol === 1) {
    for (const message of settledToV1(thread.settled.filter(isMessage), thread.v1Sequence)) {
      writeFrame(response, { data: JSON.stringify(message), event: "message" });
    }
    // Threads migrated to v2 re-announce the protocol at the boundary and
    // stream the live tail in the new format.
    const turnProtocol = turnProtocolOf(thread);
    if (turnProtocol === 2 && thread.active) {
      writeFrame(response, protocolFrame(2));
      writeFrame(response, { data: JSON.stringify({ type: "bookmark" }), event: "final" });
    }
  } else {
    for (const message of thread.settled) {
      const { [BELONGS_TO_SCOPE]: belongsTo, [ON_CHANNEL]: channel, [V1_SEQUENCE]: _seq, ...payload } = message;
      const name = typeof channel === "string" ? channel : "final";
      writeFrame(response, { data: JSON.stringify(payload), event: belongsTo ? `${name}|${String(belongsTo)}` : name });
    }
    writeFrame(response, { data: JSON.stringify({ type: "bookmark" }), event: "final" });
  }

  const active = thread.active;
  if (active) {
    pipeTurn(active, request, response);
  } else {
    if (thread.config.protocol === 2) {
      writeFrame(response, { data: "{}", event: "complete" });
    } else {
      writeFrame(response, { data: "{}", event: "done" });
    }
    response.end();
  }
}

function pipeTurn(turn: ActiveTurn, request: IncomingMessage, response: ServerResponse): void {
  const unsubscribe = turn.subscribe((event) => {
    if (event.kind === "frame") {
      writeFrame(response, event.frame);
    } else if (event.kind === "comment") {
      response.write(`: ${event.text}\n\n`);
    } else {
      response.destroy();
    }
  });
  request.on("close", unsubscribe);
  void turn.done.then(() => {
    unsubscribe();
    response.end();
  });
}

function endOfFixtureTurn(turnCounter: number): FixtureItem[] {
  return [
    {
      frame: {
        data: JSON.stringify({
          content: "This recorded thread has no more turns — pick another thread to keep exploring.",
          id: `eof-${turnCounter}`,
          type: "assistant",
        }),
        event: "final",
      },
      kind: "frame",
    },
  ];
}

/** REST reads carry scope membership as `in_scope` — distinct from an agent action's `scope_id`, which names the scope it opens. */
/** A migrated thread replays history in one protocol and streams new turns in another. */
function turnProtocolOf(thread: ThreadState): 1 | 2 {
  return thread.config.turn_protocol ?? thread.config.protocol;
}

function toRestMessage(message: Record<string, unknown>): Record<string, unknown> {
  const { [BELONGS_TO_SCOPE]: belongsTo, [V1_SEQUENCE]: _seq, ...payload } = message;
  return belongsTo ? { ...payload, in_scope: belongsTo } : payload;
}

/** Errors live in the replayed stream, not in the message list — a REST read returns messages. */
function isMessage(entry: Record<string, unknown>): boolean {
  return entry[ON_CHANNEL] === undefined;
}

function settledToV1(
  messages: Record<string, unknown>[],
  sequenceFor: (message: Record<string, unknown>) => number,
): Record<string, unknown>[] {
  const converted: Record<string, unknown>[] = [];
  for (const message of messages) {
    switch (message.type) {
      case "user":
        converted.push({ at: message.timestamp, body: message.content, kind: "user", seq: sequenceFor(message) });
        break;
      case "assistant":
        converted.push({ body: message.content, done: true, kind: "bot", seq: sequenceFor(message) });
        break;
      case "action":
        converted.push({
          attachments: Array.isArray(message.artifacts) ? message.artifacts : [],
          kind: "tool",
          name: String(message.title ?? "tool"),
          seq: sequenceFor(message),
          status: message.has_succeeded === false ? "error" : "ok",
        });
        break;
      // thinking, commands, artifact references, bookmarks, metadata: absent in v1
      default:
        break;
    }
  }
  return converted;
}

function openSse(response: ServerResponse, request: IncomingMessage): void {
  response.writeHead(200, {
    "access-control-allow-origin": "*",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "content-type": "text/event-stream",
  });
  request.socket.setNoDelay(true);
}

function writeFrame(response: ServerResponse, frame: Frame): void {
  if (response.writableEnded || response.destroyed) {
    return;
  }
  let payload = "";
  if (frame.event) {
    payload += `event: ${frame.event}\n`;
  }
  for (const line of frame.data.split("\n")) {
    payload += `data: ${line}\n`;
  }
  response.write(`${payload}\n`);
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolvePromise(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "access-control-allow-origin": "*",
    "content-type": "application/json",
  });
  response.end(JSON.stringify(body));
}
