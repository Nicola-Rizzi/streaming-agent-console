import type { ActionMessage, AskUserQuestion, StreamFrame, UserMessage } from "../api/types";
import { decodeFrame, ROOT } from "./decode";
import type {
  Decoded,
  Entry,
  TextEntry,
  TranscriptAction,
  TranscriptState,
  TurnStatus,
  UnknownMessage,
  WireMessage,
} from "./types";

export const initialState: TranscriptState = {
  entries: {},
  order: {},
  artifacts: {},
  historyLength: null,
  live: null,
  legacy: false,
  nextId: 0,
  outcomes: {},
};

export function transcriptReducer(state: TranscriptState, action: TranscriptAction): TranscriptState {
  switch (action.type) {
    case "frames":
      return applyFrames(state, action.frames);
    case "sent":
      return startTurn(state, action.text);
    case "ended":
      if (state.live?.status !== "streaming") return state;
      return { ...state, live: { ...state.live, status: outcome(action.reason, state.live.lastWasError) } };
  }
}

function startTurn(state: TranscriptState, text: string): TranscriptState {
  const draft = edit(state);
  // Remember how the previous turn ended: a stop leaves no trace in the content.
  const previous = lastUserKey(draft);
  if (previous && draft.live) draft.outcomes = { ...draft.outcomes, [previous]: draft.live.status };
  put(draft, ROOT, { kind: "user", key: `local:${draft.nextId++}`, content: text, attachments: [] });
  draft.live = { status: "streaming", lastWasError: false };
  return draft;
}

function outcome(reason: "stopped" | "dropped" | "closed", lastWasError: boolean): TurnStatus {
  if (reason === "stopped") return "stopped";
  if (reason === "closed" && lastWasError) return "failed";
  return "interrupted";
}

function applyFrames(state: TranscriptState, frames: StreamFrame[]): TranscriptState {
  const decoded = frames.flatMap(decodeFrame).filter((d) => d.kind !== "ignored");
  if (decoded.length === 0) return state;

  const draft = edit(state);
  for (const event of decoded) applyDecoded(draft, event);
  return draft;
}

/** Copied once per call; the maps can then be written for the rest of it. */
function edit(state: TranscriptState): TranscriptState {
  return { ...state, entries: { ...state.entries }, order: { ...state.order }, artifacts: { ...state.artifacts } };
}

function applyDecoded(draft: TranscriptState, d: Decoded): void {
  switch (d.kind) {
    case "protocol":
      if (d.version === 1) {
        draft.legacy = true;
        // A reply about to arrive in v1 gets a placeholder rather than an empty turn.
        if (draft.live?.status === "streaming") {
          put(draft, ROOT, { kind: "unknown", key: `:legacy:${draft.nextId++}`, type: "legacy" });
        }
      }
      return;
    case "complete":
      if (draft.live?.status === "streaming") draft.live = { ...draft.live, status: "completed" };
      return;
    case "problem":
      contentArrived(draft, true);
      put(draft, d.scope, { kind: "problem", key: `${d.scope}:problem:${draft.nextId++}`, problem: d.problem });
      return;
    case "malformed":
      contentArrived(draft, false);
      put(draft, d.scope, { kind: "unknown", key: `${d.scope}:anonymous:${draft.nextId++}`, type: "malformed" });
      return;
    case "message":
      if (d.message.type === "bookmark") {
        draft.historyLength = rootKeys(draft).length;
        return;
      }
      contentArrived(draft, false);
      applyMessage(draft, d.scope, d.channel, d.message);
      return;
  }
}

/** Content after the bookmark with no live turn means the resume joined one in flight. */
function contentArrived(draft: TranscriptState, isError: boolean): void {
  if (draft.historyLength !== null && draft.live === null) draft.live = { status: "streaming", lastWasError: false };
  if (draft.live && draft.live.lastWasError !== isError) draft.live = { ...draft.live, lastWasError: isError };
}

function applyMessage(
  draft: TranscriptState,
  scope: string,
  channel: "streaming" | "final",
  message: WireMessage,
): void {
  const key = (id: string) => `${scope}:${id}`;

  switch (message.type) {
    case "user": {
      const m = message as UserMessage;
      put(draft, scope, { kind: "user", key: key(m.id), content: m.content, attachments: m.file_attachments ?? [] });
      return;
    }
    case "assistant":
    case "thinking": {
      const m = message as { id: string; content: string };
      const previous = draft.entries[key(m.id)];
      const entry = applyText(previous?.kind === message.type ? (previous as TextEntry) : null, channel, m.content);
      put(draft, scope, { ...entry, kind: message.type, key: key(m.id) });
      return;
    }
    case "action": {
      const m = message as ActionMessage;
      for (const artifact of m.artifacts ?? []) draft.artifacts[artifact.id] = artifact;
      put(draft, scope, { kind: "action", key: key(m.id), action: m });
      return;
    }
    case "artifact": {
      const id = (message as { artifact_id: string }).artifact_id;
      // Keyed per turn: the same artifact can be shown again later.
      put(draft, scope, { kind: "artifact", key: key(`artifact:${id}:turn${userCount(draft)}`), artifactId: id });
      return;
    }
    case "command": {
      const m = message as AskUserQuestion;
      if (m.command === "ask-user-question") {
        put(draft, scope, { kind: "question", key: key(`command:${m.id}`), ask: m });
      } else {
        put(draft, scope, { kind: "unknown", key: key(`command:${m.id}`), type: `command:${m.command}` });
      }
      return;
    }
    case "metadata":
      if ((message as { maximum_size_reached?: boolean }).maximum_size_reached) {
        put(draft, scope, { kind: "limit", key: key("metadata:limit") });
      }
      return;
    default: {
      const { id } = message as UnknownMessage;
      const localId = typeof id === "string" ? id : `anonymous:${draft.nextId++}`;
      put(draft, scope, { kind: "unknown", key: key(`${message.type}:${localId}`), type: message.type });
    }
  }
}

/** A delta appends, a final replaces the deltas, a delta after a final continues from it. */
function applyText(
  previous: TextEntry | null,
  channel: "streaming" | "final",
  content: string,
): Pick<TextEntry, "streamed" | "final"> {
  if (channel === "final") return { streamed: previous?.streamed ?? "", final: content };
  const sofar = previous ? (previous.final ?? previous.streamed) : "";
  return { streamed: sofar + content };
}

function rootKeys(draft: TranscriptState): string[] {
  return draft.order[ROOT] ?? [];
}

function lastUserKey(draft: TranscriptState): string | undefined {
  return [...rootKeys(draft)].reverse().find((k) => draft.entries[k].kind === "user");
}

function userCount(draft: TranscriptState): number {
  return rootKeys(draft).filter((k) => draft.entries[k].kind === "user").length;
}

/** A replaced entry keeps its position. */
function put(draft: TranscriptState, scope: string, entry: Entry): void {
  if (!(entry.key in draft.entries)) {
    draft.order[scope] = [...(draft.order[scope] ?? []), entry.key];
  }
  draft.entries[entry.key] = entry;
}
