import { memo, type ReactNode } from "react";

import { strings } from "../../strings";
import type { ActionView, Block, ThinkingView } from "../types";
import { ActionItem } from "./ActionItem";
import { Thinking } from "./Thinking";

type ActionGroupProps = {
  items: (ActionView | ThinkingView)[];
  /** Passed in to avoid a circular import with Blocks. */
  renderBlocks: (blocks: Block[]) => ReactNode;
};

export const ActionGroup = memo(function ActionGroup({ items, renderBlocks }: ActionGroupProps) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white">
      <header className="border-b border-neutral-100 px-3 py-1.5 text-xs text-process">{groupSummary(items)}</header>
      <ul className="divide-y divide-neutral-100 px-3">
        {items.map((item) =>
          item.kind === "action" ? (
            <ActionItem item={item} key={item.key} renderBlocks={renderBlocks} />
          ) : (
            <li className="py-2 pl-6" key={item.key}>
              <Thinking streaming={item.streaming} text={item.text} />
            </li>
          ),
        )}
      </ul>
    </section>
  );
});

/** "3 steps · 1 specialist · working on: Fetch benchmarks" */
function groupSummary(items: (ActionView | ThinkingView)[]): string {
  const actions = items.filter((i): i is ActionView => i.kind === "action");
  const specialists = actions.filter((a) => a.action.kind === "agent").length;
  const running = actions.find((a) => a.status === "running");
  return [
    strings.actions.steps(actions.length),
    specialists > 0 ? strings.actions.specialists(specialists) : null,
    running ? strings.actions.workingOn(running.action.title) : null,
  ]
    .filter(Boolean)
    .join(strings.format.separator);
}
