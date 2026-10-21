import type { CommandQuestion } from "../../api/types";
import { strings } from "../../strings";
import type { Answer } from "./types";

type QuestionFieldProps = {
  question: CommandQuestion;
  answer: Answer;
  /** Radio group name. Question ids repeat across asks. */
  group: string;
  onToggle: (label: string) => void;
  onOther: (text: string) => void;
};

export function QuestionField({ question, answer, group, onToggle, onOther }: QuestionFieldProps) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 text-sm">
        <span className="block text-[11px] tracking-wide text-process uppercase">{question.header}</span>
        {question.question}
        {question.multi_select && <span className="ml-1 text-xs text-process">{strings.questions.chooseAny}</span>}
      </legend>
      {question.options.map((option) => (
        <label
          className="flex cursor-pointer items-start gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm has-[:checked]:border-neutral-900"
          key={option.label}
        >
          <input
            checked={answer.picked.includes(option.label)}
            className="mt-1"
            name={group}
            onChange={() => onToggle(option.label)}
            type={question.multi_select ? "checkbox" : "radio"}
          />
          <span>
            {option.label}
            {option.description && <span className="block text-xs text-process">{option.description}</span>}
          </span>
        </label>
      ))}
      <input
        aria-label={strings.questions.otherLabel(question.question)}
        className="rounded-lg border border-neutral-200 px-3 py-2 text-sm"
        onChange={(event) => onOther(event.target.value)}
        placeholder={strings.questions.otherPlaceholder}
        value={answer.other}
      />
    </fieldset>
  );
}
