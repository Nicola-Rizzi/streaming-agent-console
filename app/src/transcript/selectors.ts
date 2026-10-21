import type { ActionMessage } from "../api/types";
import { ROOT } from "./decode";
import type {
  ActionStatus,
  ActionView,
  Block,
  Entry,
  TextEntry,
  ThinkingView,
  TranscriptState,
  TranscriptView,
  TurnStatus,
  TurnView,
} from "./types";

export function selectTranscript(state: TranscriptState): TranscriptView {
  const root = state.order[ROOT] ?? [];
  const pendingKey = pendingQuestionKey(state, root);
  const segments = splitIntoTurns(state, root);
  const pending = pendingKey ? state.entries[pendingKey] : undefined;
  return {
    turns: segments.map((segment, index) => turnView(state, segment, index, index === segments.length - 1, pendingKey)),
    pendingQuestion: pending?.kind === "question" ? pending.ask : null,
    limitReached: Object.values(state.entries).some((e) => e.kind === "limit"),
    legacy: state.legacy,
  };
}

type Segment = { start: number; keys: string[] };

/** `visited` stops a scope that points back at itself. */
type Context = { state: TranscriptState; turnStatus: TurnStatus; pendingKey: string | null; visited: Set<string> };

function turnView(
  state: TranscriptState,
  segment: Segment,
  index: number,
  isLast: boolean,
  pendingKey: string | null,
): TurnView {
  // Only the last turn can be the one running in this view; the others ended earlier or come from history.
  const live = isLast ? state.live : null;
  const status = live?.status ?? state.outcomes[segment.keys[0]] ?? settledStatus(state, segment.keys);
  const first = state.entries[segment.keys[0]];
  const user = first?.kind === "user" ? { content: first.content, attachments: first.attachments } : undefined;
  const ctx: Context = { state, turnStatus: status, pendingKey, visited: new Set() };
  return {
    // Positional: turns only ever append, and the first message's key changes when a resume replays it.
    key: `turn:${index}`,
    user,
    blocks: toBlocks(ctx, user ? segment.keys.slice(1) : segment.keys),
    status,
    // The turn a resume joined starts before the bookmark too, but it is live, not history.
    history: !live && state.historyLength !== null && segment.start < state.historyLength,
  };
}

function splitIntoTurns(state: TranscriptState, root: string[]): Segment[] {
  const turns: Segment[] = [];
  root.forEach((key, index) => {
    if (state.entries[key].kind === "user" || turns.length === 0) turns.push({ start: index, keys: [] });
    turns[turns.length - 1].keys.push(key);
  });
  return turns;
}

/** History has no lifecycle frames, so the outcome comes from the content. */
function settledStatus(state: TranscriptState, keys: string[]): TurnStatus {
  const last = state.entries[keys[keys.length - 1]];
  if (last?.kind === "problem") return "failed";
  const unsettled = keys.map((k) => state.entries[k]).some((e) => e.kind === "action" && !isSettled(e.action));
  return unsettled ? "interrupted" : "completed";
}

function pendingQuestionKey(state: TranscriptState, root: string[]): string | null {
  let pending: string | null = null;
  for (const key of root) {
    const kind = state.entries[key].kind;
    if (kind === "question") pending = key;
    else if (kind === "user") pending = null;
  }
  return pending;
}

/** Consecutive actions form a group. Thinking stays inside an open group. */
function toBlocks(ctx: Context, keys: string[]): Block[] {
  const blocks: Block[] = [];
  let group: Extract<Block, { kind: "group" }> | null = null;

  for (const key of keys) {
    const entry = ctx.state.entries[key];
    if (entry.kind === "action") {
      if (!group) {
        group = { kind: "group", key: `group:${key}`, items: [] };
        blocks.push(group);
      }
      group.items.push(actionView(ctx, entry));
    } else if (entry.kind === "thinking" && group) {
      group.items.push(thinkingView(ctx, entry));
    } else {
      group = null;
      const block = toBlock(ctx, entry);
      if (block) blocks.push(block);
    }
  }
  return blocks;
}

function toBlock(ctx: Context, entry: Entry): Block | null {
  switch (entry.kind) {
    case "thinking":
      return thinkingView(ctx, entry);
    case "assistant":
      return {
        kind: "assistant",
        key: entry.key,
        text: textOf(entry),
        streaming: isStreaming(ctx, entry),
      };
    case "artifact":
      return {
        kind: "artifact",
        key: entry.key,
        artifactId: entry.artifactId,
        artifact: ctx.state.artifacts[entry.artifactId],
      };
    case "question":
      return { kind: "question", key: entry.key, ask: entry.ask, pending: entry.key === ctx.pendingKey };
    case "problem":
    case "limit":
    case "unknown":
      return entry;
    case "user":
      // A user message inside a sub-agent scope is not part of the contract; show it as unsupported.
      return { kind: "unknown", key: entry.key, type: "user" };
    case "action":
      return null;
  }
}

function thinkingView(ctx: Context, entry: TextEntry): ThinkingView {
  return { kind: "thinking", key: entry.key, text: textOf(entry), streaming: isStreaming(ctx, entry) };
}

function textOf(entry: TextEntry): string {
  return entry.final ?? entry.streamed;
}

function isStreaming(ctx: Context, entry: { final?: string }): boolean {
  return entry.final === undefined && ctx.turnStatus === "streaming";
}

/** A scope whose agent action never arrives is never reached, so it isn't shown. */
function actionView(ctx: Context, entry: Extract<Entry, { kind: "action" }>): ActionView {
  const { action } = entry;
  const scope = action.kind === "agent" ? action.scope_id : undefined;
  let children: Block[] = [];
  if (scope && scope !== ROOT && !ctx.visited.has(scope)) {
    ctx.visited.add(scope);
    children = toBlocks(ctx, ctx.state.order[scope] ?? []);
  }
  return {
    kind: "action",
    key: entry.key,
    action,
    status: actionStatus(action, ctx.turnStatus),
    children,
    outputs: outputsOf(ctx, action),
  };
}

/** Results can point at an artifact too (`artifact_id`); latest delivery wins. */
function outputsOf(ctx: Context, action: ActionMessage): ActionView["outputs"] {
  const own = action.artifacts ?? [];
  const pointed = (action.results ?? []).map((r) => r.artifact_id).filter((id): id is string => Boolean(id));
  const ids = new Set([...own.map((a) => a.id), ...pointed]);
  return [...ids].map((id) => ({ id, artifact: ctx.state.artifacts[id] ?? own.find((a) => a.id === id) }));
}

function isSettled(action: ActionMessage): boolean {
  return typeof action.has_succeeded === "boolean";
}

function actionStatus(action: ActionMessage, turn: TurnStatus): ActionStatus {
  if (isSettled(action)) return action.has_succeeded ? "succeeded" : "failed";
  if (turn === "streaming") return "running";
  return turn === "stopped" ? "stopped" : "interrupted";
}
