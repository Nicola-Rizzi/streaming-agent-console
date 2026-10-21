import type { ActionView, Block, TranscriptView } from "../transcript/types";

/**
 * The derived tree as plain text, one line per node, indented by depth, so
 * expected results can be written by hand and read at a glance in a diff:
 *
 *   turn [completed] user: Review the Q3 …
 *     group
 *       action [succeeded] Audience specialist
 *         assistant: The overlap is …
 *     assistant: Here is the …
 *
 * Text is cut to its first words: the structure is what these tests pin down.
 */
export function outline(view: TranscriptView): string[] {
  const lines: string[] = [];
  for (const turn of view.turns) {
    const user = turn.user ? ` user: ${short(turn.user.content)}` : "";
    lines.push(`turn [${turn.status}]${user}`);
    for (const { node, depth } of walk(turn.blocks, 1)) {
      lines.push("  ".repeat(depth) + describe(node));
    }
  }
  return lines;
}

/** One node as one line of text. */
function describe(node: Block | ActionView): string {
  switch (node.kind) {
    case "group":
      return "group";
    case "action":
      return `action [${node.status}] ${node.action.title}`;
    case "thinking":
    case "assistant":
      return `${node.kind}: ${short(node.text)}`;
    case "artifact":
      return `artifact ${node.artifactId} (${node.artifact?.type ?? "missing"})`;
    case "question":
      return `question ${node.ask.id}${node.pending ? " (pending)" : ""}`;
    case "problem":
      return `problem: ${node.problem.title}`;
    case "limit":
      return "limit reached";
    case "unknown":
      return `unknown ${node.type}`;
  }
}

/** The first four words, with "…" if there were more. */
function short(text: string): string {
  const words = text.split(/\s+/).filter(Boolean);
  return words.slice(0, 4).join(" ") + (words.length > 4 ? " …" : "");
}

/** Every node as a flat list, parents first, with its depth: blocks, group items, a sub-agent's blocks. */
function walk(blocks: Block[], depth: number): { node: Block | ActionView; depth: number }[] {
  const nodes: { node: Block | ActionView; depth: number }[] = [];
  for (const block of blocks) {
    nodes.push({ node: block, depth });
    if (block.kind !== "group") continue;
    for (const item of block.items) {
      nodes.push({ node: item, depth: depth + 1 });
      if (item.kind === "action") nodes.push(...walk(item.children, depth + 2));
    }
  }
  return nodes;
}
