import { useRef, type ReactNode } from "react";
import { ErrorBoundary } from "react-error-boundary";

import { reportError } from "../../report";
import { strings } from "../../strings";
import { Unavailable } from "./Unavailable";

type BlockBoundaryProps = {
  children: ReactNode;
  /** A new value resets the boundary: more streamed data may fix the render. */
  block: unknown;
};

// Keeps a render error inside one block, and reports it once.
export function BlockBoundary({ children, block }: BlockBoundaryProps) {
  const reported = useRef(false);
  return (
    <ErrorBoundary
      fallback={<Unavailable text={strings.content.renderFailed} />}
      onError={(error, info) => {
        if (reported.current) return;
        reported.current = true;
        reportError("block render", error, info.componentStack);
      }}
      resetKeys={[block]}
    >
      {children}
    </ErrorBoundary>
  );
}
