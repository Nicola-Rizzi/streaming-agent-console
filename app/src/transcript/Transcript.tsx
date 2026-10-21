import { strings } from "../strings";
import { AnswerContext } from "./components/AnswerContext";
import { LoadingSkeleton } from "./components/LoadingSkeleton";
import { StateMessage } from "./components/StateMessage";
import { Turn } from "./components/Turn";
import { useStickToBottom } from "./components/useStickToBottom";
import type { Snapshot, TranscriptView } from "./types";

type TranscriptProps = {
  snapshot: Snapshot;
  view: TranscriptView;
  onResume: () => void;
  onAnswer: (text: string) => void;
};

export function Transcript({ onAnswer, onResume, snapshot, view }: TranscriptProps) {
  const streaming = view.turns.at(-1)?.status === "streaming";
  const { scrollRef, contentRef, onScroll, away, toBottom } = useStickToBottom(streaming, view.turns.length);

  return (
    <AnswerContext.Provider value={onAnswer}>
      <div className="relative h-full">
        <div className="h-full overflow-y-auto" onScroll={onScroll} ref={scrollRef}>
          <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-8" ref={contentRef}>
            {snapshot.load === "loading" && <LoadingSkeleton />}
            {snapshot.load === "failed" && (
              <StateMessage title={strings.transcript.loadFailedTitle}>
                <p>{strings.transcript.loadFailedBody}</p>
                <button className="mt-2 underline" onClick={onResume} type="button">
                  {strings.transcript.tryAgain}
                </button>
              </StateMessage>
            )}
            {snapshot.load === "ready" && view.legacy && (
              <p className="rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm text-process">
                {strings.transcript.legacyNotice}
              </p>
            )}
            {snapshot.load === "ready" && view.turns.length === 0 && !view.legacy && (
              <StateMessage title={strings.transcript.emptyTitle}>{strings.transcript.emptyBody}</StateMessage>
            )}
            {snapshot.load === "ready" &&
              view.turns.map((turn, index) => (
                <Turn
                  // Only the last turn shows the connection; the others get a constant, so their memo holds.
                  connection={index === view.turns.length - 1 ? snapshot.connection : "idle"}
                  isLast={index === view.turns.length - 1}
                  key={turn.key}
                  onResume={onResume}
                  turn={turn}
                />
              ))}
            {view.limitReached && (
              <p className="rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm">
                <span className="font-medium">{strings.transcript.limitTitle}</span> {strings.transcript.limitBody}
              </p>
            )}
          </div>
        </div>
        {away && (
          <button
            className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-neutral-900 px-4 py-1.5 text-xs font-medium text-white shadow-lg"
            onClick={toBottom}
            type="button"
          >
            ↓ {streaming ? strings.transcript.newContent : strings.transcript.backToLatest}
          </button>
        )}
      </div>
    </AnswerContext.Provider>
  );
}
