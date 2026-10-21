import type { IncomingMessage, Server } from "node:http";
import type { AddressInfo } from "node:net";

import { once } from "node:events";
import { request } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createMockServer } from "./index";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createMockServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  await fetch(`${baseUrl}/api/reset`, { method: "POST" });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
});

describe("turn lifecycle", () => {
  it("does not restore an old turn's output after reset", async () => {
    const turnResponse = await fetch(`${baseUrl}/api/threads/silent-stall/turns`, {
      body: JSON.stringify({ text: "start" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(turnResponse.status).toBe(200);

    const reader = turnResponse.body?.getReader();
    expect(reader).toBeDefined();
    const decoder = new TextDecoder();
    let received = "";
    while (!received.includes("event: streaming")) {
      const next = await reader!.read();
      expect(next.done).toBe(false);
      received += decoder.decode(next.value, { stream: true });
    }

    const resetResponse = await fetch(`${baseUrl}/api/reset`, { method: "POST" });
    expect(resetResponse.status).toBe(200);
    await reader!.cancel();
    await new Promise((resolve) => setTimeout(resolve, 10));

    const historyResponse = await fetch(`${baseUrl}/api/threads/silent-stall/messages`);
    const history = (await historyResponse.json()) as { messages: { id?: string }[] };
    expect(history.messages.map((message) => message.id)).toEqual(["u1"]);
  });

  it("rejects a second turn while the first request body is still arriving", async () => {
    const firstRequest = request(`${baseUrl}/api/threads/welcome/turns`, {
      headers: { "content-type": "application/json", "transfer-encoding": "chunked" },
      method: "POST",
    });
    const firstResponsePromise = once(firstRequest, "response") as Promise<[IncomingMessage]>;
    firstRequest.write('{"text":"first"');
    await new Promise((resolve) => setTimeout(resolve, 20));

    const secondResponse = await fetch(`${baseUrl}/api/threads/welcome/turns`, {
      body: JSON.stringify({ text: "second" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(secondResponse.status).toBe(409);

    firstRequest.end("}");
    const [firstResponse] = await firstResponsePromise;
    expect(firstResponse.statusCode).toBe(200);
    firstResponse.destroy();
  });
});
