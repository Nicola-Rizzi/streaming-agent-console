// Wire contract for the Streaming Agent Console.
// v2 is the current protocol, described by the types below. v1 is documented in PROTOCOL_V1.md at the repo root.

/** One raw SSE frame, exactly as it came off the wire. Decoding happens in transcript/decode.ts. */
export type StreamFrame = {
  /** Contents of the `event:` field. May carry a `|<scope_id>` suffix. Empty string if absent. */
  event: string;
  /** Contents of the `data:` field, undecoded. Empty string if absent. */
  data: string;
};

// ---- v2 payloads (the shapes found inside `data:` on streaming/final frames) ----

export type UserMessage = {
  type: "user";
  id: string;
  content: string;
  timestamp: string;
  /** Files sent with the message. The text usually refers to them. */
  file_attachments?: FileAttachment[];
};

export type FileAttachment = { id: string; type: "file"; file_name: string; file_type?: string; file_size?: number };
/** `in_scope` appears on REST reads only: which sub-agent scope this message belongs to. */
export type AssistantMessage = { type: "assistant"; id: string; content: string; in_scope?: string };
export type ThinkingMessage = { type: "thinking"; id: string; content: string; in_scope?: string };

export type ActionMessage = {
  type: "action";
  id: string;
  title: string;
  icon: string;
  input?: unknown;
  results?: ActionResult[];
  /** Absent or null while running; true or false once it settles. */
  has_succeeded?: boolean | null;
  artifacts?: Artifact[];
  /**
   * `agent` opens a sub-agent scope, `library` reads a document, `tool` is a
   * plain tool call — and absent means the same as `tool`. The assistant grows
   * new kinds without announcing them, hence the open union.
   */
  kind?: "agent" | "library" | "tool" | (string & {});
  /** One sub-agent invocation; never reused across turns in this thread. */
  scope_id?: string;
  started_at?: string;
  ended_at?: string;
};

/**
 * What an action produced, as one line. `type` is usually absent: read an
 * `artifact_id` as a pointer to an artifact whether or not `type` says `file`.
 */
export type ActionResult = { title?: string; icon?: string; type?: "text" | "file"; artifact_id?: string };

export type ArtifactReference = { type: "artifact"; artifact_id: string };

export type CommandQuestion = {
  /** Unique within this ask, not across the thread. */
  id: string;
  header: string;
  question: string;
  options: { label: string; description?: string }[];
  multi_select: boolean;
};

/**
 * One to four questions, asked together. The user answers them as a set and the
 * reply arrives as a single user turn.
 */
export type AskUserQuestion = {
  type: "command";
  command: "ask-user-question";
  /** Stable identity of this ask within the thread, including replay and REST reads. */
  id: string;
  questions: CommandQuestion[];
};

export type BookmarkMessage = { type: "bookmark" };
export type MetadataMessage = { type: "metadata"; maximum_size_reached?: boolean };

export type MessageEvent =
  | UserMessage
  | AssistantMessage
  | ThinkingMessage
  | ActionMessage
  | ArtifactReference
  | AskUserQuestion
  | BookmarkMessage
  | MetadataMessage;

export type Artifact = ChartArtifact | TableArtifact | FileArtifact;

export type ChartArtifact = { id: string; type: "chart"; data: unknown[]; layout: Record<string, unknown> };
/** Column-major: each key is a column name, each value the column's cells. */
export type TableArtifact = { id: string; type: "table"; columns: Record<string, unknown[]> };
export type FileArtifact = { id: string; type: "file"; file_name: string; file_type: string; file_size: number };

export type ProblemDetails = { title: string; status?: number; detail?: string };

// ---- REST DTOs ----

export type ThreadDto = { id: string; title: string; protocol: 1 | 2; updated_at: string };
export type ThreadsPage = { threads: ThreadDto[]; next_cursor: string | null };
