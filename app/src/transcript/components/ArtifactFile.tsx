import type { FileArtifact } from "../../api/types";
import { strings } from "../../strings";
import { formatBytes } from "./format";

export function ArtifactFile({ artifact }: { artifact: FileArtifact }) {
  const extension = artifact.file_name.includes(".")
    ? artifact.file_name.split(".").pop()!.toUpperCase()
    : strings.content.fileExtension;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2">
      <span className="grid h-10 w-8 shrink-0 place-items-center rounded border border-neutral-300 font-mono text-[10px] text-process">
        {extension.slice(0, 4)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{artifact.file_name}</span>
        <span className="block text-xs text-process">
          {[artifact.file_type, typeof artifact.file_size === "number" ? formatBytes(artifact.file_size) : null]
            .filter(Boolean)
            .join(strings.format.separator)}
        </span>
      </span>
    </div>
  );
}
