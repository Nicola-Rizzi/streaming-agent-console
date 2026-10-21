import { memo } from "react";

import type { Artifact as ArtifactData } from "../../api/types";
import { strings } from "../../strings";
import { ArtifactChart } from "./ArtifactChart";
import { ArtifactFile } from "./ArtifactFile";
import { ArtifactTable } from "./ArtifactTable";
import { Unavailable } from "./Unavailable";

export const Artifact = memo(function Artifact({ artifact, id }: { artifact?: ArtifactData; id: string }) {
  if (!artifact) return <Unavailable text={strings.content.artifactMissing(id)} />;
  switch (artifact.type) {
    case "table":
      return <ArtifactTable artifact={artifact} />;
    case "file":
      return <ArtifactFile artifact={artifact} />;
    case "chart":
      return <ArtifactChart artifact={artifact} />;
    default:
      return <Unavailable text={strings.content.artifactUnsupported((artifact as { type: string }).type)} />;
  }
});
