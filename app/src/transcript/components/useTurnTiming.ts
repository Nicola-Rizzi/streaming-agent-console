import { useEffect, useState } from "react";

import type { Timing } from "./types";

export function useTurnTiming(streaming: boolean): Timing {
  const [startedAt] = useState(() => (streaming ? Date.now() : null));
  const [endedAt, setEndedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!streaming && startedAt !== null) setEndedAt((ended) => ended ?? Date.now());
  }, [streaming, startedAt]);

  return {
    startedAt,
    seconds: startedAt !== null && endedAt !== null ? Math.round((endedAt - startedAt) / 1000) : null,
  };
}

export function useElapsedSeconds(since: number | null): number {
  const [started] = useState(() => since ?? Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return Math.round((now - started) / 1000);
}
