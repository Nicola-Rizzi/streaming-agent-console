import type { StreamFrame } from "../api/types";
import { reportWarning } from "../report";
import { strings } from "../strings";
import { initialState, transcriptReducer } from "./reducer";
import type {
  SessionOptions,
  Snapshot,
  TranscriptAction,
  TranscriptSession,
  TranscriptState,
  Transport,
} from "./types";

// A stall is the turn going quiet, not the socket, so one resume can land in the same
// silence (seen on silent-stall). Four cover about a minute.
const MAX_AUTO_RESUMES = 4;

type Connection = {
  snapshot: Snapshot;
  stream: AbortController | null;
  /** Bumped per stream; frames from an older one are dropped. */
  generation: number;
  pending: StreamFrame[];
  flushScheduled: boolean;
  watchdog: ReturnType<typeof setTimeout> | null;
  /** A resume builds here, off screen, until the bookmark. */
  rebuilding: TranscriptState | null;
  autoResumes: number;
};

// One open thread's connection: one stream at a time, Stop, the stall watchdog, resume. No React.
export function createTranscriptSession(
  threadId: string,
  transport: Transport,
  options: SessionOptions = {},
): TranscriptSession {
  const stallMs = options.stallMs ?? 15_000;
  const schedule = options.schedule ?? defaultSchedule;
  const listeners = new Set<() => void>();

  const conn: Connection = {
    snapshot: { state: initialState, load: "loading", connection: "idle" },
    stream: null,
    generation: 0,
    pending: [],
    flushScheduled: false,
    watchdog: null,
    rebuilding: null,
    autoResumes: 0,
  };

  // What the app calls

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function getSnapshot(): Snapshot {
    return conn.snapshot;
  }

  function open(): void {
    // A thread already on screen stays visible while it reloads.
    if (conn.snapshot.load === "failed") update({ load: "loading" });
    startResume();
  }

  function send(text: string): void {
    if (conn.snapshot.load !== "ready" || isBusy()) return;
    conn.autoResumes = 0;
    dispatch({ type: "sent", text });
    connect((signal) => transport.send(threadId, text, signal), "send");
  }

  // Only a streaming turn can be stopped, so cancel goes out once.
  function stop(): void {
    if (conn.snapshot.state.live?.status !== "streaming") return;
    close();
    update({ connection: "idle" });
    dispatch({ type: "ended", reason: "stopped" });
    // The turn already shows as stopped; a failed cancel is only logged.
    transport.cancel(threadId).catch((error: unknown) => reportWarning("cancel turn", error));
  }

  function resume(): void {
    if (isBusy()) return;
    conn.autoResumes = 0;
    open();
  }

  function dispose(): void {
    close();
    listeners.clear();
  }

  // The connection

  function isBusy(): boolean {
    return conn.snapshot.connection !== "idle" || conn.snapshot.state.live?.status === "streaming";
  }

  function startResume(): void {
    conn.rebuilding = initialState;
    connect((signal) => transport.resume(threadId, signal), "resume");
  }

  function connect(openStream: (signal: AbortSignal) => AsyncIterable<StreamFrame>, kind: "send" | "resume"): void {
    close();
    const controller = new AbortController();
    const mine = ++conn.generation;
    conn.stream = controller;
    if (conn.snapshot.connection !== "reconnecting") update({ connection: "streaming" });
    armWatchdog();

    void (async () => {
      let failed = false;
      let gotFrame = false;
      try {
        for await (const frame of openStream(controller.signal)) {
          if (mine !== conn.generation) return;
          gotFrame = true;
          armWatchdog();
          conn.pending.push(frame);
          requestFlush();
        }
      } catch (error) {
        failed = true;
        // Aborted = closed on purpose or stalled.
        if (!controller.signal.aborted) {
          reportWarning("transcript stream", error);
          // A send that got nothing back was refused (e.g. 409): that's a failure, not a drop.
          if (kind === "send" && !gotFrame) {
            conn.pending.push(refusedFrame(error));
            failed = false;
          }
        }
      }
      // Closed on purpose: whoever closed it already updated the state.
      if (mine !== conn.generation) return;
      flush();
      finish(controller.signal.aborted, failed);
    })();
  }

  // The stream ended by itself or stalled (a stall is also `failed`).
  function finish(stalled: boolean, failed: boolean): void {
    clearWatchdog();
    conn.stream = null;

    if (stalled && conn.autoResumes < MAX_AUTO_RESUMES) {
      conn.autoResumes++;
      update({ connection: "reconnecting" });
      startResume();
      return;
    }

    const rebuilt = conn.rebuilding;
    conn.rebuilding = null;

    // The load never reached a bookmark: fine for v1 (it has none), a failure otherwise.
    if (rebuilt && conn.snapshot.load === "loading") {
      if (rebuilt.legacy && !failed) update({ state: rebuilt, load: "ready", connection: "idle" });
      else update({ load: "failed", connection: "idle" });
      return;
    }

    update({ connection: "idle" });
    if (conn.snapshot.state.live?.status === "streaming") {
      dispatch({ type: "ended", reason: failed ? "dropped" : "closed" });
    }
  }

  function close(): void {
    clearWatchdog();
    conn.stream?.abort();
    conn.stream = null;
    conn.generation++;
    conn.pending = [];
  }

  function armWatchdog(): void {
    clearWatchdog();
    conn.watchdog = setTimeout(() => conn.stream?.abort(), stallMs);
  }

  function clearWatchdog(): void {
    if (conn.watchdog) clearTimeout(conn.watchdog);
    conn.watchdog = null;
  }

  // Frames into state

  function requestFlush(): void {
    if (conn.flushScheduled) return;
    conn.flushScheduled = true;
    // No generation check needed: close() empties `pending`.
    schedule(() => {
      conn.flushScheduled = false;
      flush();
    });
  }

  function flush(): void {
    if (conn.pending.length === 0) return;
    const frames = conn.pending;
    conn.pending = [];

    if (!conn.rebuilding) {
      dispatch({ type: "frames", frames });
      return;
    }
    // Rebuild off screen; the old transcript stays until the bookmark.
    const rebuilt = transcriptReducer(conn.rebuilding, { type: "frames", frames });
    if (rebuilt.historyLength === null) {
      conn.rebuilding = rebuilt;
      return;
    }
    conn.rebuilding = null;
    update({ state: rebuilt, load: "ready", connection: "streaming" });
  }

  function dispatch(action: TranscriptAction): void {
    const state = transcriptReducer(conn.snapshot.state, action);
    if (state !== conn.snapshot.state) update({ state });
  }

  function update(patch: Partial<Snapshot>): void {
    conn.snapshot = { ...conn.snapshot, ...patch };
    for (const listener of listeners) listener();
  }

  return { threadId, subscribe, getSnapshot, open, send, stop, resume, dispose };
}

// A refused send as an error frame, which the reducer already shows.
function refusedFrame(error: unknown): StreamFrame {
  return { event: "error", data: JSON.stringify({ title: strings.errors.sendRefused, detail: String(error) }) };
}

function defaultSchedule(flush: () => void): void {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(flush);
  else setTimeout(flush, 0);
}
