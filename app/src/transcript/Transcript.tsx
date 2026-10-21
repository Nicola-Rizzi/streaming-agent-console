import { useEffect, useState } from "react";

import type { StreamSource } from "../App";

type Props = {
  source: StreamSource;
  threadId: string;
  /** Called when the stream ends, however it ends. */
  onClosed: () => void;
  /** Hands the Stop button a way to abort the live stream. */
  registerAbort: (abort: () => void) => void;
};

/**
 * The transcript view, for now a frame counter.
 *
 * `source.open(signal)` yields raw SSE frames from the mock service — a resume
 * when a thread is opened, a live turn when a message is sent. Opening it is
 * left to this component so the stream can be re-opened: a consumed iterator
 * cannot be replayed.
 */
export function Transcript({ onClosed, registerAbort, source, threadId }: Props) {
  const [frameCount, setFrameCount] = useState(0);

  useEffect(() => {
    const abort = new AbortController();
    registerAbort(() => abort.abort("stopped"));
    setFrameCount(0);

    void (async () => {
      try {
        for await (const _frame of source.open(abort.signal)) {
          if (abort.signal.aborted) {
            return;
          }
          setFrameCount((count) => count + 1);
        }
      } catch {
        // The stream ended abnormally — distinguishing why is part of the work.
      } finally {
        if (!abort.signal.aborted) {
          onClosed();
        }
      }
    })();

    return () => abort.abort("superseded");
    // `source.key` changes whenever a new stream should be opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.key]);

  return (
    <div className="flex h-full items-center justify-center text-sm text-neutral-400">
      Thread {threadId}: {frameCount} frames received — render me.
    </div>
  );
}
