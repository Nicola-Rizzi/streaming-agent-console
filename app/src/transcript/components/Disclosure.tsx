import type { ReactNode } from "react";

export function Disclosure({
  summary,
  children,
  className = "",
}: {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details className={`group ${className}`}>
      <summary className="cursor-pointer list-none text-xs text-process select-none hover:text-neutral-800 [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90">
          ›
        </span>{" "}
        {summary}
      </summary>
      <div className="mt-1.5">{children}</div>
    </details>
  );
}
