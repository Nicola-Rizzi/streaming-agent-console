import { useState } from "react";

import type { CommandQuestion } from "../../api/types";
import { pick } from "./answers";
import type { Answer } from "./types";

const blank: Answer = { picked: [], other: "" };

// Keyed by question id, which is only unique within one ask.
export function useAnswers() {
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const answerOf = (q: CommandQuestion): Answer => answers[q.id] ?? blank;
  const set = (q: CommandQuestion, next: Answer) => setAnswers((all) => ({ ...all, [q.id]: next }));
  return {
    answers,
    answerOf,
    toggle: (q: CommandQuestion, label: string) => set(q, pick(answerOf(q), label, q.multi_select)),
    setOther: (q: CommandQuestion, other: string) => set(q, { ...answerOf(q), other }),
  };
}
