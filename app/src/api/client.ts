import type { MessagesPage, StreamFrame, ThreadsPage } from "./types";

const BASE = "/api";

export async function fetchThreads(cursor?: string): Promise<ThreadsPage> {
  const url = cursor ? `${BASE}/threads?cursor=${encodeURIComponent(cursor)}` : `${BASE}/threads`;
  return getJson(url);
}

export async function fetchMessages(threadId: string, cursor?: string): Promise<MessagesPage> {
  const url = cursor
    ? `${BASE}/threads/${threadId}/messages?cursor=${encodeURIComponent(cursor)}`
    : `${BASE}/threads/${threadId}/messages`;
  return getJson(url);
}

export async function cancelTurn(threadId: string): Promise<void> {
  const response = await fetch(`${BASE}/threads/${threadId}/cancel`, { method: "POST" });
  if (!response.ok && response.status !== 404) {
    throw new Error(`cancel failed: ${response.status}`);
  }
}

/** Send a message and stream the assistant's turn. */
export function streamTurn(threadId: string, text: string, signal: AbortSignal): AsyncIterable<StreamFrame> {
  return streamRequest(`${BASE}/threads/${threadId}/turns`, {
    body: JSON.stringify({ text }),
    headers: { "content-type": "application/json" },
    method: "POST",
    signal,
  });
}

/** Reopen a thread: replays history, then a bookmark, then any live turn in flight. */
export function resumeThread(threadId: string, signal: AbortSignal): AsyncIterable<StreamFrame> {
  return streamRequest(`${BASE}/threads/${threadId}/resume`, { method: "GET", signal });
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

/**
 * Minimal SSE transport over fetch. Yields every dispatched frame verbatim —
 * decoding (and deciding what to do with what arrives) is up to the caller.
 */
async function* streamRequest(url: string, init: RequestInit): AsyncGenerator<StreamFrame> {
  const response = await fetch(url, init);
  if (!response.ok || !response.body) {
    throw new Error(`${url} failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let event = "";
  let data: string[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex;
      while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
        buffer = buffer.slice(newlineIndex + 1);

        if (line === "") {
          yield { data: data.join("\n"), event };
          event = "";
          data = [];
        } else if (line.startsWith("event:")) {
          event = line.slice("event:".length).trimStart();
        } else if (line.startsWith("data:")) {
          data.push(line.slice("data:".length).trimStart());
        }
        // Other fields (comments, id, retry) are not exposed; a blank line
        // after them still dispatches, so empty frames do reach the caller.
      }
    }
  } finally {
    reader.releaseLock();
  }
}
