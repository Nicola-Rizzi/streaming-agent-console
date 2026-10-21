import type { ChartArtifact } from "../../api/types";
import { strings } from "../../strings";

// Placeholder only: Plotly is about 3 MB.
export function ArtifactChart({ artifact }: { artifact: ChartArtifact }) {
  const traces = Array.isArray(artifact.data) ? artifact.data : [];
  const kinds = [...new Set(traces.map((t) => (t as { type?: string }).type ?? strings.content.chartKind))];
  const names = traces.map((t) => (t as { name?: string }).name).filter(Boolean) as string[];
  return (
    <figure className="flex h-28 flex-col justify-between rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-4">
      <figcaption className="text-sm font-medium">
        {chartTitle(artifact.layout) ?? strings.content.chartTitle}
      </figcaption>
      <p className="text-xs text-process">{strings.content.chartSummary(kinds, traces.length, names.slice(0, 4))}</p>
    </figure>
  );
}

function chartTitle(layout: Record<string, unknown> | undefined): string | null {
  const title = layout?.title;
  if (typeof title === "string") return title;
  if (title && typeof title === "object" && typeof (title as { text?: unknown }).text === "string")
    return (title as { text: string }).text;
  return null;
}
