import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { stabilize } from "./stabilize";

const components: Components = {
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table>{children}</table>
    </div>
  ),
  a: ({ children, href }) => (
    <a href={href} rel="noreferrer" target="_blank">
      {children}
    </a>
  ),
};

const plugins = [remarkGfm];

type MarkdownProps = { text: string; streaming?: boolean; className?: string };

export const Markdown = memo(function Markdown({ text, streaming = false, className = "" }: MarkdownProps) {
  return (
    <div
      className={`prose prose-sm prose-neutral max-w-none prose-pre:bg-neutral-900 prose-pre:text-neutral-100 prose-code:before:content-none prose-code:after:content-none ${className}`}
    >
      <ReactMarkdown components={components} remarkPlugins={plugins}>
        {streaming ? stabilize(text) : text}
      </ReactMarkdown>
    </div>
  );
});
