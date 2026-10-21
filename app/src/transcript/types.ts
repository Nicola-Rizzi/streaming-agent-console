import type {
  ActionMessage,
  Artifact,
  AskUserQuestion,
  FileAttachment,
  MessageEvent,
  ProblemDetails,
  StreamFrame,
} from "../api/types";

// Flat state for the reducer, a nested view for the UI.

// ---- State (reducer.ts) ----

export type TurnStatus = "streaming" | "completed" | "stopped" | "failed" | "interrupted";

/** Shown as `final ?? streamed`. */
export type TextEntry = {
  kind: "assistant" | "thinking";
  key: string;
  streamed: string;
  final?: string;
};

/** Keyed by `scope:id`: ids are only unique within a scope. */
export type Entry =
  | { kind: "user"; key: string; content: string; attachments: FileAttachment[] }
  | TextEntry
  | { kind: "action"; key: string; action: ActionMessage }
  | { kind: "artifact"; key: string; artifactId: string }
  | { kind: "question"; key: string; ask: AskUserQuestion }
  | { kind: "problem"; key: string; problem: ProblemDetails }
  | { kind: "limit"; key: string }
  | { kind: "unknown"; key: string; type: string };

export type TranscriptState = {
  entries: Record<string, Entry>;
  /** Keys per scope, in arrival order. */
  order: Record<string, string[]>;
  artifacts: Record<string, Artifact>;
  /** Root entries before the bookmark; null until it arrives. */
  historyLength: number | null;
  /** `lastWasError`: a clean close now means the turn failed. */
  live: { status: TurnStatus; lastWasError: boolean } | null;
  /** v1 content: only its lifecycle is read. */
  legacy: boolean;
  /** For keys the client makes up (its own messages, errors, content without an id). */
  nextId: number;
  /** How earlier turns in this view ended, by user message key (a stop isn't in the content). */
  outcomes: Record<string, TurnStatus>;
};

export type TranscriptAction =
  | { type: "frames"; frames: StreamFrame[] }
  /** The stream never echoes the user's message, so it's added here. */
  | { type: "sent"; text: string }
  /** The stream ended without `complete`. */
  | { type: "ended"; reason: "stopped" | "dropped" | "closed" };

// ---- View (selectors.ts) ----

export type ActionStatus = "running" | "succeeded" | "failed" | "interrupted" | "stopped";

export type ThinkingView = {
  kind: "thinking";
  key: string;
  text: string;
  streaming: boolean;
};

export type ActionView = {
  kind: "action";
  key: string;
  action: ActionMessage;
  status: ActionStatus;
  /** The sub-agent's blocks, if this action delegated. */
  children: Block[];
  outputs: { id: string; artifact?: Artifact }[];
};

export type Block =
  | { kind: "group"; key: string; items: (ActionView | ThinkingView)[] }
  | ThinkingView
  | { kind: "assistant"; key: string; text: string; streaming: boolean }
  | { kind: "artifact"; key: string; artifactId: string; artifact?: Artifact }
  | { kind: "question"; key: string; ask: AskUserQuestion; pending: boolean }
  | { kind: "problem"; key: string; problem: ProblemDetails }
  | { kind: "limit"; key: string }
  | { kind: "unknown"; key: string; type: string };

export type TurnView = {
  key: string;
  user?: { content: string; attachments: FileAttachment[] };
  blocks: Block[];
  status: TurnStatus;
  history: boolean;
};

export type TranscriptView = {
  turns: TurnView[];
  /** The last ask with no user turn after it. */
  pendingQuestion: AskUserQuestion | null;
  limitReached: boolean;
  legacy: boolean;
};

// ---- Wire (decode.ts) ----

export type UnknownMessage = {
  type: string;
  id?: string;
};
export type WireMessage = MessageEvent | UnknownMessage;

export type Decoded =
  | { kind: "protocol"; version: number }
  | { kind: "message"; channel: "streaming" | "final"; scope: string; message: WireMessage }
  | { kind: "malformed"; scope: string }
  | { kind: "problem"; scope: string; problem: ProblemDetails }
  | { kind: "complete" }
  | { kind: "ignored" };

// ---- Session (session.ts) ----

/** The app passes the HTTP client; tests pass a fake. */
export type Transport = {
  resume: (threadId: string, signal: AbortSignal) => AsyncIterable<StreamFrame>;
  send: (threadId: string, text: string, signal: AbortSignal) => AsyncIterable<StreamFrame>;
  cancel: (threadId: string) => Promise<void>;
};

export type Snapshot = {
  state: TranscriptState;
  /** Loading until the first bookmark. */
  load: "loading" | "ready" | "failed";
  connection: "idle" | "streaming" | "reconnecting";
};

export type SessionOptions = {
  /** Silence (no keep-alives either) for this long means the connection is dead. */
  stallMs?: number;
  /** Batches frames; defaults to requestAnimationFrame. */
  schedule?: (flush: () => void) => void;
};

export type TranscriptSession = {
  readonly threadId: string;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => Snapshot;
  open: () => void;
  send: (text: string) => void;
  stop: () => void;
  resume: () => void;
  dispose: () => void;
};
