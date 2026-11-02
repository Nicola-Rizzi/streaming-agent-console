import { memo, useState, type KeyboardEvent } from "react";

import { strings } from "../strings";

type ComposerProps = {
  disabled: boolean;
  isStreaming: boolean;
  lockedReason?: string;
  onSend: (text: string) => void;
  onStop: () => void;
};

export const Composer = memo(function Composer({ disabled, isStreaming, lockedReason, onSend, onStop }: ComposerProps) {
  const [text, setText] = useState("");
  const canSend = !disabled && !isStreaming && text.trim() !== "";

  const submit = () => {
    if (!canSend) return;
    onSend(text.trim());
    setText("");
  };

  // Enter sends, Shift+Enter adds a line. Ignored while an IME is composing.
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submit();
  };

  return (
    <div className="border-t border-neutral-200 bg-white p-3">
      <div className="flex items-end gap-2">
        <textarea
          aria-label={strings.composer.label}
          className="max-h-40 min-h-10 flex-1 resize-none rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500"
          disabled={disabled}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={lockedReason ?? (disabled ? strings.composer.noThread : strings.composer.placeholder)}
          rows={1}
          value={text}
        />
        {/* One button: Stop while a turn runs, Send otherwise. */}
        <button
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white enabled:hover:bg-neutral-700 disabled:opacity-40"
          disabled={!isStreaming && !canSend}
          onClick={isStreaming ? onStop : submit}
          type="button"
        >
          {isStreaming ? strings.composer.stop : strings.composer.send}
        </button>
      </div>
    </div>
  );
});
