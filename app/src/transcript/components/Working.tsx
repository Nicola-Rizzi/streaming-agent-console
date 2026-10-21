import { strings } from "../../strings";
import type { Block } from "../types";
import { useElapsedSeconds } from "./useTurnTiming";

export function Working({ blocks, startedAt }: { blocks: Block[]; startedAt: number | null }) {
  const seconds = useElapsedSeconds(startedAt);
  const current = runningTitle(blocks);
  return (
    <p className="flex items-center gap-2 text-xs text-process">
      <span className="size-2 rounded-full bg-neutral-700 motion-safe:animate-pulse" />
      <span aria-live="polite">{current ? strings.turn.workingOn(current) : strings.turn.working}</span>
      <span className="tabular-nums">{strings.format.seconds(seconds)}</span>
    </p>
  );
}

// Deepest running action, so a sub-agent's step is named instead of its parent.
function runningTitle(blocks: Block[]): string | null {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    if (block.kind !== "group") continue;
    for (let j = block.items.length - 1; j >= 0; j--) {
      const item = block.items[j];
      if (item.kind !== "action" || item.status !== "running") continue;
      return runningTitle(item.children) ?? item.action.title;
    }
  }
  return null;
}
