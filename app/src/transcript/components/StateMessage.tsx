import type { ReactNode } from "react";

export function StateMessage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto mt-16 max-w-sm text-center text-sm text-process">
      <p className="mb-1 font-medium text-neutral-800">{title}</p>
      {children}
    </div>
  );
}
