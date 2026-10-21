import { strings } from "../../strings";
import type { Snapshot, TurnView } from "../types";
import type { Timing } from "./types";
import { Working } from "./Working";

type TurnOutcomeProps = {
  turn: TurnView;
  isLast: boolean;
  connection: Snapshot["connection"];
  timing: Timing;
  onResume: () => void;
};

// History turns only show an outcome when they didn't complete.
export function TurnOutcome({ turn, isLast, connection, timing, onResume }: TurnOutcomeProps) {
  if (connection === "reconnecting") {
    return <p className="text-xs text-warn">{strings.turn.reconnecting}</p>;
  }
  switch (turn.status) {
    case "streaming":
      return <Working blocks={turn.blocks} startedAt={timing.startedAt} />;
    case "completed":
      return isLast && !turn.history ? (
        <p className="text-xs text-ok">
          {strings.turn.done}
          {timing.seconds !== null && (
            <span className="text-process">
              {strings.format.separator}
              {strings.format.seconds(timing.seconds)}
            </span>
          )}
        </p>
      ) : null;
    case "stopped":
      return <p className="text-xs text-process">{strings.turn.stopped}</p>;
    case "failed":
      return <p className="text-xs font-medium text-bad">{strings.turn.failed}</p>;
    case "interrupted":
      return (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warn/50 bg-warn/5 px-3 py-2 text-sm">
          <span>
            <span className="font-medium text-warn">{strings.turn.droppedTitle}</span> {strings.turn.droppedBody}
          </span>
          {isLast && (
            <button
              className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white"
              onClick={onResume}
              type="button"
            >
              {strings.turn.resume}
            </button>
          )}
        </div>
      );
  }
}
