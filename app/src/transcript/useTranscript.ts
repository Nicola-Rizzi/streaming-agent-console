import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { cancelTurn, resumeThread, streamTurn } from "../api/client";
import { initialState } from "./reducer";
import { createTranscriptSession } from "./session";
import { createViewSelector } from "./stableView";
import type { Snapshot, TranscriptSession, Transport } from "./types";

const http: Transport = { resume: resumeThread, send: streamTurn, cancel: cancelTurn };
const closed: Snapshot = { state: initialState, load: "loading", connection: "idle" };
const subscribeNothing = () => () => {};
const getClosed = () => closed;

/** One session per thread. Disposing it closes the stream (also on StrictMode's double mount). */
export function useTranscript(threadId: string | null) {
  const [session, setSession] = useState<TranscriptSession | null>(null);
  const [select] = useState(createViewSelector);

  useEffect(() => {
    if (!threadId) return;
    const next = createTranscriptSession(threadId, http);
    setSession(next);
    next.open();
    return () => next.dispose();
  }, [threadId]);

  // Until the effect swaps sessions, never show the previous thread under the new id.
  const current = session?.threadId === threadId ? session : null;
  const snapshot = useSyncExternalStore(current?.subscribe ?? subscribeNothing, current?.getSnapshot ?? getClosed);
  const view = useMemo(() => select(snapshot.state), [select, snapshot.state]);

  return { snapshot, view, session: current };
}
