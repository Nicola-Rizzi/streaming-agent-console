import { selectTranscript } from "./selectors";
import type { TranscriptState, TranscriptView } from "./types";

/** Like selectTranscript, but unchanged parts keep their old object, so memoised components skip them. */
export function createViewSelector(): (state: TranscriptState) => TranscriptView {
  let previous: TranscriptView | null = null;
  return (state) => {
    previous = share(previous, selectTranscript(state));
    return previous;
  };
}

/** One pass. Returns `previous` itself when nothing changed. */
function share<T>(previous: unknown, next: T): T {
  if (previous === next || !isObject(previous) || !isObject(next)) return next;
  if (Array.isArray(previous) !== Array.isArray(next)) return next;

  const result = (Array.isArray(next) ? [] : {}) as Record<string, unknown>;
  let same = Object.keys(previous).length === Object.keys(next).length;
  for (const key of Object.keys(next)) {
    result[key] = share(previous[key], (next as Record<string, unknown>)[key]);
    if (result[key] !== previous[key]) same = false;
  }
  return (same ? previous : result) as T;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
