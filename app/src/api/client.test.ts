import { afterEach, describe, expect, it, vi } from "vitest";

import { resumeThread, streamTurn } from "./client";
import type { StreamFrame } from "./types";

afterEach(() => vi.unstubAllGlobals());

/** Serves `chunks` as one streamed response body, exactly as split. */
function serve(chunks: string[], status = 200) {
  const fetch = vi.fn(async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
        controller.close();
      },
    });
    return new Response(body, { status });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

async function collect(stream: AsyncIterable<StreamFrame>): Promise<StreamFrame[]> {
  const frames: StreamFrame[] = [];
  for await (const frame of stream) frames.push(frame);
  return frames;
}

const resume = () => collect(resumeThread("t1", new AbortController().signal));

describe("the SSE client", () => {
  it("reassembles frames split anywhere across chunks", async () => {
    serve(["event: fin", 'al\ndata: {"a"', ":1}\n", "\nevent: complete\ndata: {}\n\n"]);
    expect(await resume()).toEqual([
      { event: "final", data: '{"a":1}' },
      { event: "complete", data: "{}" },
    ]);
  });

  it("accepts CRLF line endings and joins multi-line data", async () => {
    serve(["event: final\r\ndata: line one\r\ndata: line two\r\n\r\n"]);
    expect(await resume()).toEqual([{ event: "final", data: "line one\nline two" }]);
  });

  it("passes keep-alive comments on as empty frames, so the stall detector sees them", async () => {
    serve([": keep-alive\n\n"]);
    expect(await resume()).toEqual([{ event: "", data: "" }]);
  });

  it("drops an event the stream ends in the middle of", async () => {
    serve(["event: final\ndata: {}\n\nevent: final\ndata: {cut"]);
    expect(await resume()).toEqual([{ event: "final", data: "{}" }]);
  });

  it("fails when the service refuses the request", async () => {
    serve([], 409);
    await expect(collect(streamTurn("t1", "hi", new AbortController().signal))).rejects.toThrow(/409/);
  });

  it("puts the thread id safely into the URL", async () => {
    const fetch = serve([]);
    await collect(resumeThread("a/b c", new AbortController().signal));
    expect(fetch).toHaveBeenCalledWith("/api/threads/a%2Fb%20c/resume", expect.anything());
  });
});
