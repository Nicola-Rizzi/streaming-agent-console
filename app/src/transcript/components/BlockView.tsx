import { memo, type ReactNode } from "react";

import { strings } from "../../strings";
import type { Block } from "../types";
import { ActionGroup } from "./ActionGroup";
import { Artifact } from "./Artifact";
import { Markdown } from "./Markdown";
import { Problem } from "./Problem";
import { QuestionCard } from "./QuestionCard";
import { Thinking } from "./Thinking";
import { Unavailable } from "./Unavailable";

type BlockViewProps = {
  block: Block;
  /** Passed in to avoid a circular import with Blocks. */
  renderBlocks: (blocks: Block[]) => ReactNode;
};

export const BlockView = memo(function BlockView({ block, renderBlocks }: BlockViewProps) {
  switch (block.kind) {
    case "assistant":
      return <Markdown streaming={block.streaming} text={block.text} />;
    case "thinking":
      return <Thinking streaming={block.streaming} text={block.text} />;
    case "group":
      return <ActionGroup items={block.items} renderBlocks={renderBlocks} />;
    case "artifact":
      return <Artifact artifact={block.artifact} id={block.artifactId} />;
    case "problem":
      return <Problem problem={block.problem} />;
    case "question":
      return <QuestionCard ask={block.ask} pending={block.pending} />;
    case "limit":
      return null;
    case "unknown":
      return (
        <Unavailable
          text={block.type === "legacy" ? strings.content.legacyReply : strings.content.unsupported(block.type)}
        />
      );
  }
});
