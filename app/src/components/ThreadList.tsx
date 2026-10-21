import { useEffect, useState } from "react";

import type { ThreadDto } from "../api/types";

import { fetchThreads } from "../api/client";

type Props = {
  onSelect: (id: string) => void;
  selectedId: string | null;
};

export function ThreadList({ onSelect, selectedId }: Props) {
  const [threads, setThreads] = useState<ThreadDto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchThreads()
      .then((page) => {
        setThreads(page.threads);
        setCursor(page.next_cursor);
      })
      .catch((cause: unknown) => setError(String(cause)));
  }, []);

  const loadMore = () => {
    if (!cursor) {
      return;
    }
    fetchThreads(cursor)
      .then((page) => {
        setThreads((existing) => [...existing, ...page.threads]);
        setCursor(page.next_cursor);
      })
      .catch((cause: unknown) => setError(String(cause)));
  };

  if (error) {
    return <div className="p-4 text-xs text-red-600">Failed to load threads: {error}</div>;
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
          className="block w-full px-4 py-2 text-left text-xs text-neutral-500 hover:bg-neutral-100"
          onClick={loadMore}
          type="button"
        >
          Load more…
        </button>
      )}
    </nav>
  );
}
