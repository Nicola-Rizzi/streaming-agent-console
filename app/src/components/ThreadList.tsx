import { memo, useCallback, useEffect, useState } from "react";

import { fetchThreads } from "../api/client";
import type { ThreadDto } from "../api/types";
import { reportWarning } from "../report";
import { strings } from "../strings";

type ThreadListProps = {
  onSelect: (id: string) => void;
  selectedId: string | null;
};

export const ThreadList = memo(function ThreadList({ onSelect, selectedId }: ThreadListProps) {
  const [threads, setThreads] = useState<ThreadDto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // The first page replaces the list (StrictMode runs the effect twice); later pages append.
  const loadPage = useCallback(async (after?: string) => {
    setLoading(true);
    try {
      const page = await fetchThreads(after);
      setThreads((existing) => (after ? [...existing, ...page.threads] : page.threads));
      setCursor(page.next_cursor);
    } catch (cause) {
      reportWarning("thread list", cause);
      setError(String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  // loadPage catches its own errors.
  useEffect(() => {
    loadPage();
  }, [loadPage]);

  if (error) {
    return <div className="p-4 text-xs text-red-600">{strings.threads.loadFailed(error)}</div>;
  }

  return (
    <nav className="flex-1 overflow-y-auto py-2">
      {threads.map((thread) => (
        <button
          className={`block w-full truncate px-4 py-2 text-left text-sm hover:bg-neutral-100 ${
            thread.id === selectedId ? "bg-neutral-100 font-medium" : ""
          }`}
          key={thread.id}
          onClick={() => onSelect(thread.id)}
          type="button"
        >
          {thread.title}
        </button>
      ))}
      {cursor && (
        <button
          className="block w-full px-4 py-2 text-left text-xs text-neutral-500 enabled:hover:bg-neutral-100 disabled:opacity-50"
          disabled={loading}
          onClick={() => loadPage(cursor)}
          type="button"
        >
          {strings.threads.loadMore}
        </button>
      )}
    </nav>
  );
});
