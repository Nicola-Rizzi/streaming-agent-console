import { strings } from "../../strings";
import type { ActionStatus } from "../types";

// Glyph, colour and label: state is never carried by colour alone.
export function StatusIcon({ status }: { status: ActionStatus }) {
  const label = strings.actions.status[status];
  if (status === "running") {
    return (
      <span
        aria-label={label}
        className="mt-0.5 inline-block size-3.5 shrink-0 rounded-full border-2 border-neutral-300 border-t-neutral-700 motion-safe:animate-spin"
        role="img"
      />
    );
  }
  const glyph = { succeeded: "✓", failed: "✕", interrupted: "⊘", stopped: "■" }[status];
  const tone = { succeeded: "text-ok", failed: "text-bad", interrupted: "text-warn", stopped: "text-neutral-500" }[
    status
  ];
  return (
    <span
      aria-label={label}
      className={`w-3.5 shrink-0 text-center text-xs leading-5 font-semibold ${tone}`}
      role="img"
    >
      {glyph}
    </span>
  );
}
