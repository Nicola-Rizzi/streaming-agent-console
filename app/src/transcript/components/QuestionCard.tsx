import { useContext, useEffect, useRef } from "react";

import type { AskUserQuestion } from "../../api/types";
import { strings } from "../../strings";
import { AnswerContext } from "./AnswerContext";
import { QuestionField } from "./QuestionField";
import { formatAnswers } from "./answers";
import { useAnswers } from "./useAnswers";

// The assistant never offers "Other", so every question gets a free-text field.
export function QuestionCard({ ask, pending }: { ask: AskUserQuestion; pending: boolean }) {
  const send = useContext(AnswerContext);
  const { answers, answerOf, toggle, setOther } = useAnswers();
  const formRef = useRef<HTMLFormElement>(null);

  // The composer is locked while a question waits, so the question is where the keyboard goes next.
  useEffect(() => {
    if (pending) formRef.current?.focus({ preventScroll: true });
  }, [pending]);

  if (!pending) {
    return (
      <div className="rounded-xl border border-neutral-200 px-3 py-2 text-sm text-process">
        {ask.questions.map((q) => (
          <p key={q.id}>{q.question}</p>
        ))}
      </div>
    );
  }

  return (
    <form
      aria-label={strings.questions.label}
      className="flex flex-col gap-4 rounded-xl border border-neutral-900 bg-white p-4"
      onSubmit={(event) => {
        event.preventDefault();
        send(formatAnswers(ask.questions, answers));
      }}
      ref={formRef}
      tabIndex={-1}
    >
      {ask.questions.map((q) => (
        <QuestionField
          answer={answerOf(q)}
          group={`${ask.id}:${q.id}`}
          key={q.id}
          onOther={(text) => setOther(q, text)}
          onToggle={(label) => toggle(q, label)}
          question={q}
        />
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-process">{strings.questions.footer}</span>
        <button className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white" type="submit">
          {strings.questions.send}
        </button>
      </div>
    </form>
  );
}
