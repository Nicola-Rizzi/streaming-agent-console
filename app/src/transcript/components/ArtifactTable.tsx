import type { TableArtifact } from "../../api/types";
import { strings } from "../../strings";

const MAX_ROWS = 50;

export function ArtifactTable({ artifact }: { artifact: TableArtifact }) {
  const columns = Object.keys(artifact.columns ?? {});
  const rowCount = Math.max(0, ...columns.map((c) => artifact.columns[c]?.length ?? 0));
  const shown = Math.min(rowCount, MAX_ROWS);
  return (
    <figure className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm tabular-nums">
          <thead className="bg-neutral-50 text-xs text-process">
            <tr>
              {columns.map((c) => (
                <th className="px-3 py-2 font-medium whitespace-nowrap" key={c}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: shown }, (_, row) => (
              <tr className="border-t border-neutral-100" key={row}>
                {columns.map((c) => (
                  <td className="px-3 py-1.5 align-top" key={c}>
                    {cell(artifact.columns[c]?.[row])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rowCount > shown && (
        <figcaption className="border-t border-neutral-100 px-3 py-1.5 text-xs text-process">
          {strings.content.tableRows(shown, rowCount)}
        </figcaption>
      )}
    </figure>
  );
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return strings.content.emptyCell;
  if (typeof value === "number") return value.toLocaleString("en");
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
