import { memo } from "react";

import type { Block } from "../types";
import { BlockBoundary } from "./BlockBoundary";
import { BlockView } from "./BlockView";

export const Blocks = memo(function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block) => (
        <BlockBoundary block={block} key={block.key}>
          <BlockView block={block} renderBlocks={renderBlocks} />
        </BlockBoundary>
      ))}
    </div>
  );
});

const renderBlocks = (blocks: Block[]) => <Blocks blocks={blocks} />;
