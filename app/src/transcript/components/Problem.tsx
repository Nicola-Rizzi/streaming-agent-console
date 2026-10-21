import type { ProblemDetails } from "../../api/types";

export function Problem({ problem }: { problem: ProblemDetails }) {
  return (
    <div className="rounded-lg border border-bad/40 bg-bad/5 px-3 py-2 text-sm">
      <p className="font-medium text-bad">
        {problem.title}
        {problem.status !== undefined && <span className="ml-2 font-mono text-xs">{problem.status}</span>}
      </p>
      {problem.detail && <p className="text-xs text-neutral-600">{problem.detail}</p>}
    </div>
  );
}
