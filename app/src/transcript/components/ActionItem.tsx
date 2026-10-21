import { memo, type ReactNode } from "react";

import { strings } from "../../strings";
import type { ActionView, Block as BlockData } from "../types";
import { ActionInput } from "./ActionInput";
import { Artifact } from "./Artifact";
import { Disclosure } from "./Disclosure";
import { formatDuration } from "./format";
import { StatusIcon } from "./StatusIcon";

type ActionItemProps = { item: ActionView; renderBlocks: (blocks: BlockData[]) => ReactNode };

export const ActionItem = memo(function ActionItem({ item, renderBlocks }: ActionItemProps) {
  const { action, status, children, outputs } = item;
  const results = (action.results ?? []).filter((r) => r.title);
  const duration = status === "running" ? null : formatDuration(action.started_at, action.ended_at);
  const hasDetails = action.input !== undefined || outputs.length > 0 || results.length > 1;

  return (
    <li className="py-2">
      <div className="flex items-start gap-2.5">
        <StatusIcon status={status} />
        <div className="min-w-0 flex-1">
          <p
            className={`text-sm ${status === "interrupted" || status === "stopped" ? "text-process" : "text-neutral-800"}`}
          >
            {action.title}
            {action.kind === "agent" && (
              <span className="ml-2 rounded border border-neutral-200 px-1.5 py-px text-[11px] text-process">
                {strings.actions.specialistTag}
              </span>
            )}
            {duration && <span className="ml-2 text-xs text-process tabular-nums">{duration}</span>}
          </p>
          {results[0] && <p className="text-xs text-process">{results[0].title}</p>}
          {(status === "interrupted" || status === "stopped") && (
            <p className="text-xs text-warn">
              {status === "stopped" ? strings.actions.stoppedNote : strings.actions.interruptedNote}
            </p>
          )}
          {hasDetails && (
            <Disclosure
              className="mt-1"
              summary={
                outputs.length > 0 ? strings.actions.detailsWithOutputs(outputs.length) : strings.actions.details
              }
            >
              <div className="flex flex-col gap-2">
                {results.length > 1 && (
                  <ul className="list-disc pl-4 text-xs text-process">
                    {results.map((r, i) => (
                      <li key={i}>{r.title}</li>
                    ))}
                  </ul>
                )}
                {outputs.map((output) => (
                  <Artifact artifact={output.artifact} id={output.id} key={output.id} />
                ))}
                {action.input !== undefined && <ActionInput input={action.input} />}
              </div>
            </Disclosure>
          )}
          {children.length > 0 && (
            <div className="mt-2 border-l-2 border-neutral-200 pl-3">{renderBlocks(children)}</div>
          )}
        </div>
      </div>
    </li>
  );
});
