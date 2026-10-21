import { strings } from "../../strings";

export function LoadingSkeleton() {
  return (
    <div
      aria-label={strings.transcript.loadingLabel}
      className="flex flex-col gap-3 motion-safe:animate-pulse"
      role="status"
    >
      <div className="h-8 w-2/5 self-end rounded-2xl bg-neutral-200" />
      <div className="h-4 w-11/12 rounded bg-neutral-200" />
      <div className="h-4 w-3/4 rounded bg-neutral-200" />
      <div className="h-16 w-full rounded-xl bg-neutral-100" />
    </div>
  );
}
