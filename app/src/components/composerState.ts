import { strings } from "../strings";
import type { Snapshot, TranscriptView } from "../transcript/types";

type ComposerState = {
  turnRunning: boolean;
  /** Set exactly when the composer is locked. */
  lockedReason?: string;
};

export function composerState(snapshot: Snapshot, view: TranscriptView): ComposerState {
  const turnRunning = snapshot.state.live?.status === "streaming";
  return { turnRunning, lockedReason: lockedReason(snapshot, view, turnRunning) };
}

function lockedReason({ load, connection }: Snapshot, view: TranscriptView, turnRunning: boolean): string | undefined {
  const { locked } = strings.composer;
  if (load === "loading") return locked.loading;
  if (load === "failed") return locked.loadFailed;
  if (view.limitReached) return locked.full;
  if (connection === "reconnecting") return locked.reconnecting;
  if (view.pendingQuestion && !turnRunning) return locked.question;
  // Nothing can be sent while connecting, but only a running turn can be stopped.
  if (connection !== "idle" && !turnRunning) return locked.connecting;
  return undefined;
}
