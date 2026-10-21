import { memo } from "react";

import { strings } from "../../strings";
import { Disclosure } from "./Disclosure";

export const Thinking = memo(function Thinking({ text, streaming }: { text: string; streaming: boolean }) {
  if (streaming) {
    return (
      <p className="line-clamp-2 text-xs text-process italic">
        <span className="not-italic">{strings.thinking.live}</span> {text.slice(-220)}
      </p>
    );
  }
  return (
    <Disclosure summary={strings.thinking.settled}>
      <p className="text-xs whitespace-pre-wrap text-process">{text}</p>
    </Disclosure>
  );
});
