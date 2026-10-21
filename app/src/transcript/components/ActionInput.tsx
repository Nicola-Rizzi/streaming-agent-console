import { Markdown } from "./Markdown";

// Report inputs are markdown; anything else is shown as JSON.
export function ActionInput({ input }: { input: unknown }) {
  const report = reportContent(input);
  if (report) return <Markdown className="rounded-lg border border-neutral-200 bg-white p-3" text={report} />;
  return (
    <pre className="max-h-64 overflow-auto rounded-lg bg-neutral-50 p-2 font-mono text-[11px] text-neutral-700">
      {JSON.stringify(input, null, 2)}
    </pre>
  );
}

function reportContent(input: unknown): string | null {
  const record = input as { type?: unknown; content?: unknown } | null;
  return record?.type === "report" && typeof record.content === "string" ? record.content : null;
}
