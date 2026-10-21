import { useState } from "react";

type Props = {
  disabled: boolean;
  isStreaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
};

export function Composer({ disabled, isStreaming, onSend, onStop }: Props) {
  const [text, setText] = useState("");

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled || isStreaming) {
      return;
    }
    onSend(trimmed);
    setText("");
  };

  return (
    <div className="border-t border-neutral-200 bg-white p-3">
      <div className="flex items-end gap-2">
        <textarea
          className="max-h-40 min-h-10 flex-1 resize-none rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
          disabled={disabled}
          onChange={(changeEvent) => setText(changeEvent.target.value)}
          onKeyDown={(keyEvent) => {
            if (keyEvent.key === "Enter" && !keyEvent.shiftKey) {
              keyEvent.preventDefault();
              submit();
            }
          }}
          placeholder={disabled ? "Select a thread first" : "Ask the assistant…"}
          rows={1}
          value={text}
        />
        {isStreaming ? (
          <button
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
            onClick={onStop}
            type="button"
          >
            Stop
          </button>
        ) : (
          <button
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            disabled={disabled || !text.trim()}
            onClick={submit}
            type="button"
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
}
