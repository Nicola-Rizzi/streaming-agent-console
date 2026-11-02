import { useCallback, useEffect, useState } from "react";

import { Composer } from "./components/Composer";
import { composerState } from "./components/composerState";
import { ThreadList } from "./components/ThreadList";
import { strings } from "./strings";
import { Transcript } from "./transcript/Transcript";
import { useTranscript } from "./transcript/useTranscript";

export function App() {
  const [threadId, setThreadId] = useState<string | null>(null);
  const { snapshot, view, session } = useTranscript(threadId);

  const composer = composerState(snapshot, view);
  // Stable callbacks, so memoised children don't re-render.
  const send = useCallback((text: string) => session?.send(text), [session]);
  const resume = useCallback(() => session?.resume(), [session]);
  const stop = useCallback(() => session?.stop(), [session]);

  // Turns can take a minute: the tab title says when the user is needed again.
  useEffect(() => {
    const { tabTitle } = strings.app;
    if (composer.turnRunning) document.title = tabTitle.working;
    else if (view.pendingQuestion) document.title = tabTitle.question;
    else document.title = tabTitle.idle;
  }, [composer.turnRunning, view.pendingQuestion]);

  return (
    <div className="flex h-screen bg-neutral-50 text-neutral-900">
      <aside className="flex w-64 shrink-0 flex-col border-r border-neutral-200 bg-white">
        <header className="flex h-12 shrink-0 items-center border-b border-neutral-200 px-4 text-sm font-semibold">
          {strings.app.name}
        </header>
        <ThreadList onSelect={setThreadId} selectedId={threadId} />
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1">
          {threadId ? (
            <Transcript key={threadId} onAnswer={send} onResume={resume} snapshot={snapshot} view={view} />
          ) : (
            <EmptyState />
          )}
        </div>
        <Composer
          disabled={!threadId || composer.lockedReason !== undefined}
          isStreaming={composer.turnRunning}
          lockedReason={threadId ? composer.lockedReason : undefined}
          onSend={send}
          onStop={stop}
        />
      </main>
    </div>
  );
}

function EmptyState() {
  return <div className="flex h-full items-center justify-center text-sm text-process">{strings.app.noThread}</div>;
}
