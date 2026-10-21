import type { ProblemDetails, StreamFrame } from "../api/types";
import { strings } from "../strings";
import type { Decoded, WireMessage } from "./types";

/** Root scope; sub-agents use the `|scope_id` suffix of the event name. */
export const ROOT = "";

/** Never throws: bad input becomes `malformed` or `ignored`. */
export function decodeFrame({ event, data }: StreamFrame): Decoded[] {
  const [channel, scope = ROOT] = event.split("|", 2);
  const payload = parse(data);
  const fields = fieldsOf(payload);

  switch (channel) {
    case "protocol":
      return typeof fields.version === "number"
        ? [{ kind: "protocol", version: fields.version }]
        : [{ kind: "ignored" }];
    case "streaming":
    case "final":
      return (Array.isArray(payload) ? payload : [payload]).map((item): Decoded =>
        typeof fieldsOf(item).type === "string"
          ? { kind: "message", channel, scope, message: item as WireMessage }
          : { kind: "malformed", scope },
      );
    case "error":
      return [{ kind: "problem", scope, problem: toProblem(fields) }];
    case "fail": // v1's failed turn: { message }
      return [{ kind: "problem", scope, problem: toProblem({ title: fields.message }) }];
    case "complete":
    case "done": // v1's end of turn
      return [{ kind: "complete" }];
    // Keep-alives land here; the session's watchdog has already counted them.
    default:
      return [{ kind: "ignored" }];
  }
}

function parse(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    return undefined;
  }
}

function fieldsOf(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function toProblem(fields: Record<string, unknown>): ProblemDetails {
  return {
    title: typeof fields.title === "string" ? fields.title : strings.errors.untitled,
    status: typeof fields.status === "number" ? fields.status : undefined,
    detail: typeof fields.detail === "string" ? fields.detail : undefined,
  };
}
