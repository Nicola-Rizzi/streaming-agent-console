import { useCallback, useMemo, useRef, useState } from "react";

import type { StreamFrame } from "./api/types";

import { cancelTurn, resumeThread, streamTurn } from "./api/client";
import { Composer } from "./components/Composer";
import { ThreadList } from "./components/ThreadList";
import { Transcript } from "./transcript/Transcript";

/**
 * A stream that hasn't been opened yet.
 *
 * The transcript is handed this rather than a live `AsyncIterable`, because an
 * iterator can only be consumed once: React would re-run an effect holding one
 * (in StrictMode, on every mount) and find it already exhausted. A factory can
 * be called again, so re-subscribing — after a remount, or a reconnect you
 * write yourself — just works.
 */
export type StreamSource = {
  /** Changes whenever a new stream should be opened. */
  key: string;
  open: (signal: AbortSignal) => AsyncIterable<StreamFrame>;
};

export function App() {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [source, setSource] = useState<StreamSource | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  /** Set by the transcript so the composer's Stop button can reach the live stream. */
  const abortStream = useRef<(() => void) | null>(null);
  const sequence = useRef(0);

  const openThread = useCallback((id: string) => {
    sequence.current += 1;
    setThreadId(id);
    setIsStreaming(false);
    setSource({ key: `resume:${id}:${sequence.current}`, open: (signal) => resumeThread(id, signal) });
  }, []);

  const send = useCallback(
    (text: string) => {
      if (!threadId) {
        return;
      }
      sequence.current += 1;
      setIsStreaming(true);
      setSource({ key: `turn:${threadId}:${sequence.current}`, open: (signal) => streamTurn(threadId, text, signal) });
    },
    [threadId],
  );

  const stop = useCallback(() => {
    if (!threadId) {
      return;
    }
    abortStream.current?.();
    setIsStreaming(false);
    void cancelTurn(threadId);
  }, [threadId]);

  const transcript = useMemo(
    () =>
      threadId && source ? (
        <Transcript
          key={threadId}
          onClosed={() => setIsStreaming(false)}
          registerAbort={(abort) => {
            abortStream.current = abort;
          }}
          source={source}
          threadId={threadId}
        />
      ) : (
        <EmptyState />
      ),
    [threadId, source],
  );

  return (
    <div className="flex h-screen bg-neutral-50 text-neutral-900">
      <aside className="flex w-64 shrink-0 flex-col border-r border-neutral-200 bg-white">
        <header className="flex h-12 shrink-0 items-center border-b border-neutral-200 px-4 text-sm font-semibold">
          Assistant
        </header>
        <ThreadList onSelect={openThread} selectedId={threadId} />
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1">{transcript}</div>
        <Composer disabled={!threadId} isStreaming={isStreaming} onSend={send} onStop={stop} />
      </main>
    </div>
  );
}

function EmptyState() {
  return <div className="flex h-full items-center justify-center text-sm text-neutral-400">Select a thread</div>;
}
