// Single place for error reporting: the console for now, a service like Sentry later.

/** A bug, e.g. a component that threw. */
export function reportError(where: string, error: unknown, details?: unknown): void {
  console.error(`[${where}]`, error, ...(details === undefined ? [] : [details]));
}

/** An expected failure the UI already shows (dropped stream, late cancel). */
export function reportWarning(where: string, error: unknown): void {
  console.warn(`[${where}]`, error);
}
