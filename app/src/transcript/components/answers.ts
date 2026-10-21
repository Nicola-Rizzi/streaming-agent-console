import type { CommandQuestion } from "../../api/types";
import { strings } from "../../strings";
import type { Answer } from "./types";

export function pick(answer: Answer, label: string, multiSelect: boolean): Answer {
  if (!multiSelect) return { ...answer, picked: [label] };
  const picked = answer.picked.includes(label) ? answer.picked.filter((p) => p !== label) : [...answer.picked, label];
  return { ...answer, picked };
}

// One `header: answer` line per question.
export function formatAnswers(questions: CommandQuestion[], answers: Record<string, Answer>): string {
  return questions
    .map((q) => {
      const answer = answers[q.id];
      const parts = [...(answer?.picked ?? []), answer?.other.trim()].filter(Boolean);
      return `${q.header}: ${parts.length > 0 ? parts.join(", ") : strings.questions.noAnswer}`;
    })
    .join("\n");
}
