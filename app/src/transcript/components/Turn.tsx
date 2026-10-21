import { memo } from "react";

import type { Snapshot, TurnView } from "../types";
import { Blocks } from "./Blocks";
import { TurnOutcome } from "./TurnOutcome";
import { UserMessage } from "./UserMessage";
import { useTurnTiming } from "./useTurnTiming";

type TurnProps = {
  turn: TurnView;
  isLast: boolean;
  connection: Snapshot["connection"];
  onResume: () => void;
};

// Memoised: unchanged turns keep their object (see stableView.ts).
export const Turn = memo(function Turn({ turn, isLast, connection, onResume }: TurnProps) {
  const timing = useTurnTiming(turn.status === "streaming");
  return (
    <article className="flex flex-col gap-3" data-status={turn.status}>
      {turn.user && <UserMessage user={turn.user} />}
      <Blocks blocks={turn.blocks} />
      <TurnOutcome connection={connection} isLast={isLast} onResume={onResume} timing={timing} turn={turn} />
    </article>
  );
});
